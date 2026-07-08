// Receives Google's redirect after you approve access, exchanges the one-time
// code for tokens, and shows you the refresh token to copy into Vercel's
// environment variables (GOOGLE_REFRESH_TOKEN). This page is safe to revisit —
// it never stores anything itself.
module.exports = async (req, res) => {
  const { code, error } = req.query || {};

  if (error) {
    res.status(400).send(`<p>Google returned an error: ${escapeHtml(error)}</p>`);
    return;
  }
  if (!code) {
    res.status(400).send("<p>Missing authorization code in the callback URL.</p>");
    return;
  }

  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    res.status(500).send("<p>GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set in Vercel yet.</p>");
    return;
  }

  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const redirectUri = `https://${host}/api/google-callback`;

  const params = new URLSearchParams({
    code,
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  try {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const data = await r.json();

    if (!data.refresh_token) {
      res.status(400).send(`
        <html><body style="font-family:sans-serif;max-width:600px;margin:60px auto;line-height:1.5;">
          <h2>No refresh token returned</h2>
          <p>Google only issues a refresh token the first time you approve access (or after you revoke and re-approve).</p>
          <p>Go to <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">Google Account → Permissions</a>,
          remove access for this app, then visit <a href="/api/google-auth-start">/api/google-auth-start</a> again.</p>
          <pre style="background:#f2f2f2;padding:12px;border-radius:8px;white-space:pre-wrap;">${escapeHtml(JSON.stringify(data, null, 2))}</pre>
        </body></html>
      `);
      return;
    }

    res.status(200).send(`
      <html><body style="font-family:sans-serif;max-width:600px;margin:60px auto;line-height:1.6;">
        <h2>✅ Connected to Google Calendar</h2>
        <p>Copy this refresh token and add it as a Vercel environment variable named <code>GOOGLE_REFRESH_TOKEN</code>:</p>
        <textarea readonly style="width:100%;height:90px;font-family:monospace;font-size:13px;padding:10px;box-sizing:border-box;">${escapeHtml(data.refresh_token)}</textarea>
        <p>Steps: Vercel dashboard → your project → <strong>Settings → Environment Variables</strong> → add
        <code>GOOGLE_REFRESH_TOKEN</code> with this value → redeploy.</p>
        <p>Once that's set, Little Foot will refresh its own Google Calendar access automatically from now on —
        you won't need to visit this page again.</p>
      </body></html>
    `);
  } catch (e) {
    res.status(500).send(`<p>Token exchange failed: ${escapeHtml(e.message)}</p>`);
  }
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
