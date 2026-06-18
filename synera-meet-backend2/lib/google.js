import { google } from 'googleapis';
import { supabase } from './supabase.js';
import { encrypt, decrypt } from './crypto.js';

// calendar.events: create/update events + Meet links on the mentor's calendar
// meetings.space.created: read conference records/attendance for spaces this mentor created
//   (only returns data if the mentor's account is on a Google Workspace plan with Meet API access enabled)
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/meetings.space.created',
];

export function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

// mentorId is passed through as `state` so the callback knows whose tokens these are
export function getAuthUrl(mentorId) {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline', // required to get a refresh_token
    prompt: 'consent',      // forces refresh_token on re-auth too
    scope: SCOPES,
    state: mentorId,
  });
}

export async function saveTokensForMentor(mentorId, tokens) {
  const row = {
    mentor_id: mentorId,
    access_token: tokens.access_token ? encrypt(tokens.access_token) : undefined,
    expiry_date: tokens.expiry_date,
    scope: tokens.scope,
    updated_at: new Date().toISOString(),
  };
  // Google only sends refresh_token on first consent — don't overwrite with undefined on later refreshes
  if (tokens.refresh_token) row.refresh_token = encrypt(tokens.refresh_token);

  const { error } = await supabase
    .from('mentor_google_tokens')
    .upsert(row, { onConflict: 'mentor_id' });

  if (error) throw error;
}

export async function getAuthedClientForMentor(mentorId) {
  const { data, error } = await supabase
    .from('mentor_google_tokens')
    .select('*')
    .eq('mentor_id', mentorId)
    .single();

  if (error || !data) {
    throw new Error('Mentor has not connected Google Calendar yet');
  }

  const client = getOAuthClient();
  client.setCredentials({
    refresh_token: decrypt(data.refresh_token),
    access_token: data.access_token ? decrypt(data.access_token) : undefined,
    expiry_date: data.expiry_date,
  });

  // Persist any rotated access token automatically
  client.on('tokens', (tokens) => {
    saveTokensForMentor(mentorId, tokens).catch((err) =>
      console.error('Failed to persist refreshed token', err)
    );
  });

  return client;
}
