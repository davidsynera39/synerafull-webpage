import { google } from 'googleapis';
import { getAuthedClientForMentor } from '../../lib/google.js';
import { supabase } from '../../lib/supabase.js';

// Scheduled via vercel.json to run every 15 minutes.
//
// Real attendance only works if the mentor's Google account is on a Workspace plan
// with Meet API access enabled — see https://developers.google.com/workspace/meet/api.
// Personal Gmail accounts can still create Meet links (handled in meetings/create.js),
// they just can't be queried for who-actually-joined data. For those mentors, and for
// any session where the conference record isn't available yet, we fall back to a
// time-based "completed_unverified" status so nothing gets stuck in limbo.
export default async function handler(req, res) {
  const provided = req.headers['x-cron-secret'];
  if (!process.env.CRON_SECRET || provided !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const now = new Date().toISOString();

  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('completion_status', 'pending')
    .lt('end_time', now);

  if (error) return res.status(500).json({ error: error.message });

  const results = [];
  for (const session of sessions) {
    try {
      const result = await checkAttendanceViaMeetApi(session);
      results.push({ id: session.id, ...result });
    } catch (err) {
      console.warn(`Falling back to time-based completion for session ${session.id}: ${err.message}`);
      await supabase
        .from('sessions')
        .update({
          completion_status: 'completed_unverified',
          attendance_checked_at: new Date().toISOString(),
        })
        .eq('id', session.id);
      results.push({ id: session.id, status: 'completed_unverified', reason: err.message });
    }
  }

  res.status(200).json({ processed: results.length, results });
}

async function checkAttendanceViaMeetApi(session) {
  if (!session.meet_code) throw new Error('No meet code stored for this session');

  const authClient = await getAuthedClientForMentor(session.mentor_id);
  const meet = google.meet({ version: 'v2', auth: authClient });

  // The human-readable meeting code (from the Meet link) doubles as a lookup key for the space.
  const space = await meet.spaces.get({ name: `spaces/${session.meet_code}` });

  const { data: recordsData } = await meet.conferenceRecords.list({
    filter: `space.name="${space.data.name}"`,
  });

  const record = recordsData.conferenceRecords?.[0];
  if (!record) throw new Error('Conference record not available yet (try again later)');

  const { data: participantsData } = await meet.conferenceRecords.participants.list({
    parent: record.name,
  });

  const participants = participantsData.participants || [];
  // signedinUser entries are authenticated Google accounts; anonymousUser entries are guests.
  const signedInCount = participants.filter((p) => p.signedinUser).length;
  const totalCount = participants.length;

  // Heuristic: mentor must have joined (they're the organizer/signed-in owner of the space),
  // and at least one other participant (the mentee) must also have joined.
  const mentorAttended = signedInCount > 0;
  const menteeAttended = totalCount > 1;
  const status = mentorAttended && menteeAttended ? 'completed' : 'no_show';

  await supabase
    .from('sessions')
    .update({
      completion_status: status,
      mentor_attended: mentorAttended,
      mentee_attended: menteeAttended,
      attendance_checked_at: new Date().toISOString(),
    })
    .eq('id', session.id);

  return { status, mentorAttended, menteeAttended };
}
