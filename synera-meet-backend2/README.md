# Synera Meet Backend

Adds three things to Synera's session-booking flow:
1. Auto-generated Google Meet links when a session is booked
2. A 30-minute-before reminder email (plus Google's native calendar reminder)
3. Completion tracking — real attendance via the Google Meet API where possible, with a safe time-based fallback

## Important caveat: attendance tracking and Google Workspace

Creating Meet links works for **any** mentor with a Google account (personal Gmail included).
Reading back *who actually joined* only works if the mentor's account is on a **Google Workspace**
plan with the Meet API enabled — personal Gmail accounts don't expose conference records.

This backend handles that gracefully: if a mentor isn't on Workspace, or the conference record
isn't ready yet, the session is marked `completed_unverified` once its end time passes, instead
of failing or getting stuck. If most of your mentors use personal Gmail, treat the attendance
feature as a bonus for the subset who have Workspace, not as your primary signal — you may want
to also keep a simple manual "mark complete" button as a backstop.

## 1. Google Cloud Console setup

1. Create a project at https://console.cloud.google.com
2. Enable **Google Calendar API** and **Google Meet API** (APIs & Services > Library)
3. Configure the OAuth consent screen (External, add scopes below)
4. Create OAuth 2.0 credentials > Web application
   - Authorized redirect URI: `https://<your-backend-domain>/api/auth/google-callback`
5. Scopes needed:
   - `https://www.googleapis.com/auth/calendar.events`
   - `https://www.googleapis.com/auth/meetings.space.created`
6. While your app is in "Testing" mode, only test users you add can connect. Submit for
   verification before launch (required for these scopes since they're sensitive).

## 2. Supabase

Run `sql/schema.sql` in the Supabase SQL editor. It adds a `mentor_google_tokens` table and a
few columns to your existing `sessions` table (`meet_link`, `meet_code`, `reminder_sent`,
`completion_status`, etc).

## 3. Environment variables

Copy `.env.example` to `.env` and fill in:
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI`
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` (service role, not anon — this is server-only)
- `RESEND_API_KEY` (or swap `lib` calls for your own email provider)
- `APP_BASE_URL` (your Synera frontend, for post-OAuth redirects)
- `TOKEN_ENCRYPTION_KEY` — generate with:
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

## 4. Deploy

```
npm install
vercel deploy --prod
```

Note: this project does NOT use `vercel.json` crons, because Vercel's free Hobby plan
only allows cron schedules that run once per day or less — too infrequent for a
30-minute reminder check. Instead, the two scheduled endpoints
(`/api/cron/send-reminders` and `/api/cron/track-completion`) are protected by a
shared secret and called by a free external scheduler — see step 6.

## 5. Run the Supabase migration

Open Supabase → SQL Editor → paste the contents of `sql/schema.sql` → run it.

## 6. Set up the external scheduler (free)

1. Generate a secret: `node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"`
2. Add it as `CRON_SECRET` in Vercel's environment variables, then redeploy
3. Create a free account at cron-job.org (or any similar service)
4. Create two scheduled jobs:
   - URL: `https://<your-vercel-url>/api/cron/send-reminders`, every 5 minutes,
     header `X-Cron-Secret: <your secret>`
   - URL: `https://<your-vercel-url>/api/cron/track-completion`, every 15 minutes,
     same header


## 5. Wire up the frontend

See `frontend-integration/integration-snippet.js` for the three pieces to drop into
`synera_integrated_with_AI.html`:
- A "Connect Google Calendar" button on the mentor dashboard
- A call to `/api/meetings/create` right after a booking is confirmed
- Rendering `completion_status` on session/booking cards

## Flow summary

```
Mentor connects Calendar (one-time OAuth)
        |
Mentee books a session  -->  sessions row inserted in Supabase
        |
POST /api/meetings/create  -->  Calendar event + Meet link created, reminders set
        |
Cron: send-reminders (every 5 min)   -->  emails sent 25-30 min before start
        |
Session happens
        |
Cron: track-completion (every 15 min) -->  checks Meet API for attendance,
                                            falls back to "completed_unverified"
                                            if Workspace/API access isn't available
```
