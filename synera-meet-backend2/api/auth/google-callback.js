import { getOAuthClient, saveTokensForMentor } from '../../lib/google.js';

// GET /api/auth/google-callback?code=...&state=<mentorId>
// This URL must exactly match the redirect URI configured in Google Cloud Console.
export default async function handler(req, res) {
  const { code, state: mentorId } = req.query;

  if (!code || !mentorId) {
    return res.status(400).send('Missing code or mentorId');
  }

  try {
    const client = getOAuthClient();
    const { tokens } = await client.getToken(code);

    if (!tokens.refresh_token) {
      // Happens if the mentor had already granted consent before without revoking it.
      // Ask them to revoke access at https://myaccount.google.com/permissions and reconnect.
      return res.redirect(
        `${process.env.APP_BASE_URL}/mentor-dashboard.html?calendar=needs_reauth`
      );
    }

    await saveTokensForMentor(mentorId, tokens);
    res.redirect(`${process.env.APP_BASE_URL}/mentor-dashboard.html?calendar=connected`);
  } catch (err) {
    console.error('OAuth callback failed:', err);
    res.redirect(`${process.env.APP_BASE_URL}/mentor-dashboard.html?calendar=error`);
  }
}
