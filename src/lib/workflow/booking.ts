import "server-only";
import { generateSlots, removeBooked, type Availability } from "../availability";
import { config } from "../config";
import type { ConsultingRequest } from "../domain";
import { buildIcs } from "../ics";
import { copy } from "../messages";
import { normalizePhone, toE164 } from "../normalize";
import { notifyStaff, notifyTim, safely, sendEmail, type EmailAttachment } from "../notify";
import { cancelUnapprovedBooking, type BookingEvent } from "../scheduling";
import { getStore } from "../store";
import { apply, firstName, formatWhen, load, nowIso, WorkflowError, type Actor } from "./core";
import { scheduleLink } from "./review";

const builtin = () => config.scheduling.driver === "builtin";

/** The bare address from EMAIL_FROM ("Name <addr>" or "addr"). */
function fromAddress(): string {
  const from = config.email.from;
  return from.match(/<([^>]+)>/)?.[1] ?? from.trim();
}

/** Calendar invite for the discovery call (built-in calendar only; Calendly sends its own). */
function callInvite(req: ConsultingRequest, startIso: string, to: string, audience: "client" | "tim", cancel = false): EmailAttachment {
  const phone = req.meetingUrl?.startsWith("tel:") ? copy.callDetails(req.meetingUrl) : "";
  const summary = audience === "tim" ? `Discovery call: ${req.clientName}` : "Discovery call with Tim Berry";
  const description =
    audience === "tim"
      ? `${req.meetingUrl?.startsWith("tel:") ? `Call ${req.clientName} at ${req.meetingUrl.slice(4)}.` : ""}\nRequest: ${config.siteUrl}/admin/staff/${req.id}`
      : `${phone}\n${copy.callPurpose(config.scheduling.callDurationMinutes)}`;
  return {
    filename: "discovery-call.ics",
    contentType: `text/calendar; method=${cancel ? "CANCEL" : "REQUEST"}`,
    content: buildIcs({
      uid: `discovery-${req.id}@tim-consulting`,
      start: startIso,
      minutes: config.scheduling.callDurationMinutes,
      summary,
      description,
      organizerEmail: fromAddress(),
      attendeeEmail: to,
      cancel,
    }),
  };
}

async function matchRequest(ev: BookingEvent): Promise<ConsultingRequest | null> {
  const store = getStore();
  if (ev.requestId) {
    const r = await store.getRequest(ev.requestId);
    if (r) return r;
  }
  const byEvent = await store.findRequestBy("calendarEventId", ev.eventId);
  if (byEvent) return byEvent;
  if (ev.inviteeEmail) {
    const candidates = await store.listRequests(["Approved to Schedule"]);
    return candidates.find((r) => r.email === ev.inviteeEmail!.trim().toLowerCase()) ?? null;
  }
  return null;
}

/**
 * Booking webhook → Tape. Only requests Tim approved can be booked; anything else is
 * cancelled at the provider and flagged to staff.
 */
export async function handleBookingEvent(ev: BookingEvent, actor: Actor = "scheduler"): Promise<ConsultingRequest | null> {
  const req = await matchRequest(ev);

  if (ev.kind === "canceled") {
    if (!req || req.calendarEventId !== ev.eventId || req.status !== "Discovery Scheduled") return req;
    if (ev.rescheduled) return req; // the matching invitee.created for the new time follows
    const updated = await apply(
      req,
      actor,
      "Discovery call cancelled by client",
      { scheduledAt: undefined, meetingUrl: undefined, calendarEventId: undefined, reminder24hSent: false, reminder1hSent: false },
      { to: "Approved to Schedule" },
    );
    await notifyStaff(`Discovery call cancelled: ${req.clientName}`, `${req.clientName} cancelled their discovery call.\n\n${config.siteUrl}/admin/staff/${req.id}`);
    if (builtin() && req.scheduledAt) {
      const tim = config.email.timEmail;
      await safely("tim cancellation", () =>
        sendEmail(tim, `Discovery call cancelled: ${req.clientName}`, `${req.clientName} cancelled their call on ${formatWhen(req.scheduledAt)}. The calendar invite is attached to remove it.`, [
          callInvite(req, req.scheduledAt!, tim, "tim", true),
        ]),
      );
      if (updated.scheduleNonce) await safely("client cancellation", () => sendEmail(req.email, copy.bookingCancelled.subject, copy.bookingCancelled.body(firstName(req), scheduleLink(updated))));
    }
    return updated;
  }

  const allowed = req && (req.status === "Approved to Schedule" || req.status === "Discovery Scheduled") && !req.alternativeHandling;
  if (!req || !allowed) {
    await safely("cancel unapproved booking", () => cancelUnapprovedBooking(ev.eventId, "This booking was not made through an approved discovery request."));
    await notifyStaff(
      "Unapproved discovery booking was cancelled",
      `A booking (${ev.inviteeEmail ?? "unknown invitee"}) did not match a request Tim approved and was cancelled automatically.${req ? `\n\nRequest: ${config.siteUrl}/admin/staff/${req.id} (status: ${req.status})` : ""}`,
    );
    return null;
  }
  if (!ev.startTime) throw new WorkflowError("Booking event missing start time", "invalid_input");

  const reschedule = req.status === "Discovery Scheduled";
  const updated = await apply(
    req,
    actor,
    reschedule ? "Discovery call rescheduled" : "Discovery call booked",
    {
      scheduledAt: new Date(ev.startTime).toISOString(),
      meetingUrl: ev.meetingUrl,
      calendarEventId: ev.eventId,
      reminder24hSent: false,
      reminder1hSent: false,
    },
    { to: "Discovery Scheduled", detail: `at ${ev.startTime}` },
  );

  const when = formatWhen(updated.scheduledAt);
  const minutes = config.scheduling.callDurationMinutes;
  const start = updated.scheduledAt!;
  const manage = builtin() && updated.scheduleNonce ? scheduleLink(updated) : undefined;
  await safely("booking confirmation", () =>
    sendEmail(
      req.email,
      copy.bookingConfirmed.subject,
      copy.bookingConfirmed.body(firstName(req), when, ev.meetingUrl, minutes, manage),
      builtin() ? [callInvite(updated, start, req.email, "client")] : [],
    ),
  );
  const timSubject = `Discovery call ${reschedule ? "rescheduled" : "booked"}: ${req.clientName}`;
  const timBody = `${req.clientName} — ${when}.${ev.meetingUrl?.startsWith("tel:") ? `\n\nCall them at ${ev.meetingUrl.slice(4)}.` : ""}\n\n${config.siteUrl}/admin/staff/${req.id}`;
  if (builtin()) {
    const tim = config.email.timEmail;
    await safely("tim booking", () => sendEmail(tim, timSubject, timBody, [callInvite(updated, start, tim, "tim")]));
  } else {
    await notifyTim(timSubject, timBody);
  }
  return updated;
}

// -------------------------------------------------------------------------------------------------
// Built-in calendar
// -------------------------------------------------------------------------------------------------

export function availability(): Availability {
  const s = config.scheduling;
  return {
    timeZone: s.timeZone,
    days: s.days,
    start: s.hours.start,
    end: s.hours.end,
    intervalMinutes: s.slotIntervalMinutes,
    durationMinutes: s.callDurationMinutes,
    minNoticeHours: s.minNoticeHours,
    daysAhead: s.daysAhead,
    blockedDates: s.blockedDates,
  };
}

/** Tim's open call times, minus calls already booked by other clients. */
export async function openSlots(forRequestId?: string, now = new Date()): Promise<string[]> {
  const booked = (await getStore().listRequests(["Discovery Scheduled"]))
    .filter((r) => r.id !== forRequestId && r.scheduledAt)
    .map((r) => r.scheduledAt!);
  return removeBooked(generateSlots(availability(), now), booked, config.scheduling.callDurationMinutes);
}

/** Clients can reschedule/cancel online until the minimum-notice cut-off before the call. */
export function clientCanChange(req: ConsultingRequest, now = new Date()): boolean {
  if (req.status !== "Discovery Scheduled" || !req.scheduledAt) return false;
  return Date.parse(req.scheduledAt) - now.getTime() >= config.scheduling.minNoticeHours * 3600e3;
}

/** Client books (or moves) their call on the built-in calendar. Tim phones them at `phone`. */
export async function bookSlot(requestId: string, startTime: string, phone?: string): Promise<ConsultingRequest | null> {
  let req = await load(requestId);
  if (req.status === "Discovery Scheduled" && !clientCanChange(req)) {
    throw new WorkflowError("Your call is too soon to change online. Please reply to your confirmation email.", "invalid_state");
  }
  const start = new Date(startTime);
  if (Number.isNaN(start.getTime()) || !(await openSlots(req.id)).includes(start.toISOString())) {
    throw new WorkflowError("That time is no longer available. Please choose another time.", "invalid_input");
  }
  const number = phone?.trim() || req.phone;
  const e164 = toE164(number);
  if (!e164) throw new WorkflowError("Please enter a valid phone number for Tim to call.", "invalid_input");
  if (normalizePhone(number) !== normalizePhone(req.phone)) {
    req = await getStore().updateRequest(req.id, { phone: number }, { at: nowIso(), actor: "client", action: "Updated phone number for the call" });
  }
  return handleBookingEvent({ kind: "booked", requestId: req.id, eventId: `call-${req.id}-${start.getTime()}`, startTime: start.toISOString(), meetingUrl: `tel:${e164}` }, "client");
}

/** Client cancels their call on the built-in calendar (their private link keeps working to rebook). */
export async function cancelSlot(requestId: string): Promise<ConsultingRequest | null> {
  const req = await load(requestId);
  if (!clientCanChange(req)) throw new WorkflowError("Your call is too soon to cancel online. Please reply to your confirmation email.", "invalid_state");
  return handleBookingEvent({ kind: "canceled", requestId: req.id, eventId: req.calendarEventId! }, "client");
}
