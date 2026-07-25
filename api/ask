// Server-side proxy for the Guide screen's Anthropic calls. Keeps the API key out of the
// browser entirely — both parents' devices hit this endpoint instead of calling Anthropic
// directly, so no personal API key ever has to be typed into the app.
module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const { ANTHROPIC_API_KEY } = process.env;
  if (!ANTHROPIC_API_KEY) {
    res.status(500).json({ error: "not_configured" });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const { system, messages, max_tokens } = body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "missing_messages" });
    return;
  }

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: Math.min(parseInt(max_tokens) || 800, 1500),
        system,
        messages,
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      res.status(r.status).json(data);
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: "server_error", detail: e.message });
  }
};
