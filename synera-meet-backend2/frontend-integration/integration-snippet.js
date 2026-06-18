// === Add to synera_integrated_with_AI.html ===
// Replace BACKEND_URL with your deployed Vercel backend, e.g. https://synera-meet-backend.vercel.app

const MEET_BACKEND_URL = 'https://synera-meet-backend.vercel.app';

// 1) On the mentor dashboard: "Connect Google Calendar" button
function connectGoogleCalendar(mentorId) {
  window.location.href = `${MEET_BACKEND_URL}/api/auth/google-init?mentorId=${mentorId}`;
}
// <button onclick="connectGoogleCalendar(currentMentor.id)">Connect Google Calendar</button>

// Check the URL on mentor-dashboard.html load to show a connected/error toast:
// ?calendar=connected | needs_reauth | error
const calendarParam = new URLSearchParams(window.location.search).get('calendar');
if (calendarParam === 'connected') {
  showToast('Google Calendar connected!');
} else if (calendarParam === 'needs_reauth') {
  showToast('Please reconnect Google Calendar (revoke access first in your Google account settings).');
} else if (calendarParam === 'error') {
  showToast('Could not connect Google Calendar — please try again.');
}

// 2) After a booking is confirmed and the `sessions` row exists in Supabase,
//    call this to generate the Meet link and attach it to the session.
async function createMeetingForSession(sessionId) {
  const res = await fetch(`${MEET_BACKEND_URL}/api/meetings/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
  if (!res.ok) {
    const { error } = await res.json();
    throw new Error(error || 'Failed to create meeting');
  }
  const { meetLink } = await res.json();
  return meetLink;
}

// Example usage inside your existing booking confirmation handler:
//
// async function confirmBooking(sessionData) {
//   const { data: session } = await supabase.from('sessions').insert(sessionData).select().single();
//   try {
//     const meetLink = await createMeetingForSession(session.id);
//     showToast(`Booked! Meet link: ${meetLink}`);
//   } catch (err) {
//     // Booking still succeeds even if the mentor hasn't connected Calendar yet —
//     // just surface that the meeting link is missing so they can follow up.
//     showToast('Session booked, but no Meet link yet (mentor needs to connect Google Calendar).');
//   }
// }

// 3) On the session/booking card, render completion_status from the `sessions` row:
//    pending -> "Upcoming"
//    completed -> "Completed ✅ (verified attendance)"
//    completed_unverified -> "Completed (attendance not verified)"
//    no_show -> "Marked as no-show"
