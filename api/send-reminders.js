// Checks the household's schedule/routines and sends a Web Push notification to every
// subscribed device shortly before each item is due. Vercel's free Hobby plan only runs
// its own Cron Jobs once a day, so this is designed to be pinged every few minutes by a
// free external scheduler (e.g. cron-job.org) instead — see the setup notes for the URL
// and secret to use. It also accepts Vercel's own cron auth header, so it keeps working
// unmodified if this project is ever upgraded to Pro.
const webpush = require("web-push");

const SUPABASE_URL = "https://dlfdefgqqmfvoygissak.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsZmRlZmdxcW1mdm95Z2lzc2FrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxMDQxNDUsImV4cCI6MjA5ODY4MDE0NX0.bxsOoopi77wo1ttGx3GKUoxRxNWmUBU3VEf6uWGw2wg";

const WEEKDAY_IDX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

async function sbFetch(path, opts = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
}

module.exports = async (req, res) => {
  const authHeader = req.headers.authorization || "";
  const vercelOk = process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`;
  const manualOk = process.env.REMINDER_CRON_SECRET && (req.query || {}).key === process.env.REMINDER_CRON_SECRET;
  if (!vercelOk && !manualOk) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    res.status(500).json({ error: "not_configured" });
    return;
  }
  webpush.setVapidDetails(VAPID_SUBJECT || "mailto:littlefoot@example.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  try {
    const dataRes = await sbFetch("baby_data?id=eq.1&select=data");
    const rows = await dataRes.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row || !row.data) {
      res.status(200).json({ checked: 0, sent: 0, note: "no baby_data row found" });
      return;
    }

    const schedule = row.data.schedule || [];
    const profile = row.data.profile || {};
    const leadMin = parseInt(profile.scheduleReminderLeadMin) || 15;
    const tz = profile.timezone || "America/Los_Angeles";

    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, hour: "2-digit", minute: "2-digit", weekday: "short" }).formatToParts(now);
    const hh = parseInt(parts.find((p) => p.type === "hour").value, 10);
    const mm = parseInt(parts.find((p) => p.type === "minute").value, 10);
    const wd = parts.find((p) => p.type === "weekday").value;
    const nowMin = hh * 60 + mm;
    const dow = WEEKDAY_IDX[wd];
    const dateStr = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now); // YYYY-MM-DD

    const due = schedule.filter((item) => {
      if (!item.time) return false;
      if (item.days && item.days.length > 0 && !item.days.includes(dow)) return false;
      const [h, m] = item.time.split(":").map(Number);
      const diff = h * 60 + m - nowMin;
      return diff >= 0 && diff <= leadMin;
    });

    if (due.length === 0) {
      res.status(200).json({ checked: schedule.length, sent: 0 });
      return;
    }

    // De-dupe: only notify the first time we see each (item, day) pair. sent_reminders.id
    // has a unique constraint, so a repeat insert during the same lead window fails with 409.
    const toNotify = [];
    for (const item of due) {
      const id = `${item.id}_${dateStr}`;
      const insertRes = await sbFetch("sent_reminders", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ id }),
      });
      if (insertRes.status === 201) toNotify.push(item);
    }

    if (toNotify.length === 0) {
      res.status(200).json({ checked: schedule.length, candidates: due.length, sent: 0, note: "already sent today" });
      return;
    }

    const subsRes = await sbFetch("push_subscriptions?select=endpoint,subscription");
    const subs = await subsRes.json();

    let sent = 0;
    const errors = [];
    for (const sub of subs || []) {
      for (const item of toNotify) {
        const payload = JSON.stringify({
          title: "Little Foot",
          body: `${item.label || (item.type === "sleep" ? "Nap" : item.type === "feed" ? "Feeding" : "Routine")} coming up at ${item.time}`,
          url: "/",
        });
        try {
          await webpush.sendNotification(sub.subscription, payload);
          sent++;
        } catch (e) {
          if (e.statusCode === 404 || e.statusCode === 410) {
            await sbFetch(`push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}`, { method: "DELETE" });
          } else {
            errors.push(e.message);
          }
        }
      }
    }

    res.status(200).json({ checked: schedule.length, candidates: due.length, notified: toNotify.length, subscribers: (subs || []).length, sent, errors });
  } catch (e) {
    res.status(500).json({ error: "server_error", detail: e.message });
  }
};
