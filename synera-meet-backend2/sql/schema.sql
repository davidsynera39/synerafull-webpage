-- Run this in the Supabase SQL editor.

-- One row per mentor, storing their encrypted Google OAuth tokens
create table if not exists mentor_google_tokens (
  mentor_id uuid primary key, -- references your mentors/users table
  refresh_token text not null,
  access_token text,
  expiry_date bigint,
  scope text,
  updated_at timestamptz default now()
);

-- Additions to your existing `sessions` table
alter table sessions
  add column if not exists calendar_event_id text,
  add column if not exists meet_link text,
  add column if not exists meet_code text,
  add column if not exists reminder_sent boolean default false,
  add column if not exists completion_status text default 'pending',
  -- completion_status values: pending | completed | completed_unverified | no_show
  add column if not exists mentor_attended boolean,
  add column if not exists mentee_attended boolean,
  add column if not exists attendance_checked_at timestamptz;

-- Lock mentor_google_tokens down — only the backend's service_role key should touch it
alter table mentor_google_tokens enable row level security;
