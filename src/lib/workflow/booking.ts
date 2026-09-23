import "server-only";
import { config } from "../config";
import type { ConsultingRequest } from "../domain";
import { copy } from "../messages";
import { notifyStaff, notifyTim, safely, sendEmail } from "../notify";
import { cancelUnapprovedBooking, type BookingEvent } from "../scheduling";
import { getStore } from "../store";
import { apply, firstName, formatWhen, load, WorkflowError, type Actor } from "./core";

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
  await safely("booking confirmation", () =>
    sendEmail(req.email, copy.bookingConfirmed.subject, copy.bookingConfirmed.body(firstName(req), when, ev.meetingUrl, minutes)),
  );
  await notifyTim(`Discovery call ${reschedule ? "rescheduled" : "booked"}: ${req.clientName}`, `${req.clientName} — ${when}.\n\n${config.siteUrl}/admin/staff/${req.id}`);
  return updated;
}

/** Mock scheduler (dev): book a slot directly through our own token-gated page. */
export async function bookMockSlot(requestId: string, startTime: string) {
  const req = await load(requestId);
  return handleBookingEvent({
    kind: "booked",
    requestId: req.id,
    eventId: `mock-event-${req.id}-${Date.parse(startTime)}`,
    startTime,
    meetingUrl: `https://meet.example.com/tim-discovery-${req.id.slice(-6)}`,
  });
}
