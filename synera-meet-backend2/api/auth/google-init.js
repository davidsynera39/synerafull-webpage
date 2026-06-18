import { getAuthUrl } from '../../lib/google.js';

// GET /api/auth/google-init?mentorId=<uuid>
// Call this from a "Connect Google Calendar" button on the mentor dashboard.
export default function handler(req, res) {
  const { mentorId } = req.query;
  if (!mentorId) return res.status(400).json({ error: 'mentorId is required' });

  const url = getAuthUrl(mentorId);
  res.redirect(url);
}
