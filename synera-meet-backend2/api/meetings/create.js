import { google } from 'googleapis';
import { getAuthedClientForMentor } from '../../lib/google.js';
import { supabase } from '../../lib/supabase.js';

// POST /api/meetings/create  { sessionId }
// Call this right after a booking/enrollment row is inserted into `sessions`.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { sessionId } = req.body || {};
  if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });

  const { data: session, error: fetchError } = await supabase
    .from('sessions')
    .select('*, mentor:mentor_id(id, email, full_name), mentee:mentee_id(id, email, full_name)')
    .eq('id', sessionId)
    .single();

  if (fetchError || !session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  try {
    const authClient = await getAuthedClientForMentor(session.mentor.id);
    const calendar = google.calendar({ version: 'v3', auth: authClient });

    const requestBody = {
      summary: `Synera Session: ${session.mentor.full_name} & ${session.mentee.full_name}`,
      description: session.notes || 'Synera mentorship session',
      start: { dateTime: session.start_time, timeZone: session.timezone || 'UTC' },
      end: { dateTime: session.end_time, timeZone: session.timezone || 'UTC' },
      attendees: [{ email: session.mentor.email }, { email: session.mentee.email }],
      conferenceData: {
        createRequest: {
          requestId: `synera-${sessionId}`, // idempotency key — safe to retry
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
      // Google's own native reminder, on top of Synera's own email reminder sent by the cron job
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 30 },
          { method: 'email', minutes: 30 },
        ],
      },
    };

    const { data: created } = await calendar.events.insert({
      calendarId: 'primary',
      requestBody,
      conferenceDataVersion: 1, // required for conferenceData to actually be created
      sendUpdates: 'all',
    });

    const meetLink = created.hangoutLink;
    const meetCode = created.conferenceData?.conferenceId; // e.g. "abc-defg-hij", used later to look up attendance

    const { error: updateError } = await supabase
      .from('sessions')
      .update({
        calendar_event_id: created.id,
        meet_link: meetLink,
        meet_code: meetCode,
        status: 'scheduled',
        reminder_sent: false,
        completion_status: 'pending',
      })
      .eq('id', sessionId);

    if (updateError) throw updateError;

    res.status(200).json({ meetLink, eventId: created.id });
  } catch (err) {
    console.error('Failed to create meeting:', err);
    res.status(500).json({ error: err.message });
  }
}
