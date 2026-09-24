/**
 * Minimal iCalendar (.ics) invites, attached to booking emails so the call lands on Tim's and the
 * client's calendars without any calendar integration. Updates reuse the same UID with a higher
 * SEQUENCE, so a reschedule moves the existing event and a cancellation removes it.
 */

export interface CallInvite {
  uid: string;
  start: string; // ISO
  minutes: number;
  summary: string;
  description: string;
  organizerEmail: string;
  attendeeEmail: string;
  cancel?: boolean;
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => `\\${c}`);

/** Fold lines to 75 octets as RFC 5545 requires. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  out.push(rest);
  return out.join("\r\n");
}

export function buildIcs(inv: CallInvite, now = new Date()): string {
  const start = new Date(inv.start);
  const end = new Date(start.getTime() + inv.minutes * 60e3);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Tim Berry Consulting//Discovery Calls//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${inv.cancel ? "CANCEL" : "REQUEST"}`,
    "BEGIN:VEVENT",
    `UID:${inv.uid}`,
    `SEQUENCE:${Math.floor(now.getTime() / 1000)}`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escape(inv.summary)}`,
    `DESCRIPTION:${escape(inv.description)}`,
    `ORGANIZER;CN=Tim Berry Consulting:mailto:${inv.organizerEmail}`,
    `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:${inv.attendeeEmail}`,
    `STATUS:${inv.cancel ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

