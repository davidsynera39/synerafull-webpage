import { Resend } from 'resend';
import { supabase } from '../../lib/supabase.js';

const resend = new Resend(process.env.RESEND_API_KEY);

// Scheduled via vercel.json to run every 5 minutes.
// Google's own calendar reminder (set in meetings/create.js) covers people watching
// their Google Calendar — this is Synera's own reminder so it lands even for people
// who never opened the calendar invite.
export default async function handler(req, res) {
  const provided = req.headers['x-cron-secret'];
  if (!process.env.CRON_SECRET || provided !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const now = Date.now();
  const windowStart = new Date(now + 25 * 60 * 1000).toISOString();
  const windowEnd = new Date(now + 30 * 60 * 1000).toISOString();

  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('*, mentor:mentor_id(email, full_name), mentee:mentee_id(email, full_name)')
    .eq('reminder_sent', false)
    .gte('start_time', windowStart)
    .lte('start_time', windowEnd);

  if (error) return res.status(500).json({ error: error.message });

  let sent = 0;
  for (const session of sessions) {
    try {
      await resend.emails.send({
        from: 'Synera <notifications@synera.app>',
        to: [session.mentor.email, session.mentee.email],
        subject: 'Your Synera session starts in 30 minutes',
        html: `
          <p>Hi! Your session starts at ${new Date(session.start_time).toLocaleString()}.</p>
          <p><a href="${session.meet_link}">Join on Google Meet</a></p>
        `,
      });

      await supabase.from('sessions').update({ reminder_sent: true }).eq('id', session.id);
      sent += 1;
    } catch (err) {
      console.error(`Reminder failed for session ${session.id}:`, err);
    }
  }

  res.status(200).json({ checked: sessions.length, sent });
}
