// One-time setup route. Visit /api/google-auth-start once in a browser, approve
// access, and you'll land on /api/google-callback with a refresh token to copy
// into your Vercel environment variables. Not used by the app after that.
module.exports = (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    res.status(500).send("GOOGLE_CLIENT_ID environment variable is not set in Vercel yet.");
    return;
  }
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const redirectUri = `https://${host}/api/google-callback`;
  const scope = "https://www.googleapis.com/auth/calendar.events";
  const url =
    "https://accounts.google.com/o/oauth2/v2/auth" +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    "&response_type=code" +
    `&scope=${encodeURIComponent(scope)}` +
    "&access_type=offline" +
    "&prompt=consent";
  res.writeHead(302, { Location: url });
  res.end();
};
