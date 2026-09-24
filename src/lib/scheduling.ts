/**
 * Scheduling provider integration.
 *
 * Calendly (production): when Tim accepts, we create a SINGLE-USE scheduling link for the ONE
 * event type "Tim Berry Discovery Call - 15 Minutes". The event type itself is kept secret in
 * Calendly, so Tim's calendar and other event types are never exposed. The link is only reachable
 * through our token-gated page, which re-checks the request status on every visit.
 *
 * Built-in (SCHEDULING_DRIVER=builtin): the site's own calendar. Our token-gated page offers Tim's
 * open times (see availability.ts and workflow/booking.ts); Tim phones the client.
 */
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "./config";
import type { ConsultingRequest } from "./domain";

export interface BookingEvent {
  kind: "booked" | "canceled";
  requestId?: string;
  inviteeEmail?: string;
  eventId: string;
  startTime?: string;
  meetingUrl?: string;
  rescheduled?: boolean;
}

export async function createPrivateSchedulingLink(req: ConsultingRequest): Promise<string> {
  if (config.scheduling.driver === "builtin") return `builtin://schedule/${req.id}`;
  const res = await fetch("https://api.calendly.com/scheduling_links", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.scheduling.calendlyToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ max_event_count: 1, owner: config.scheduling.calendlyEventTypeUri, owner_type: "EventType" }),
  });
  if (!res.ok) throw new Error(`Calendly scheduling link creation failed (${res.status})`);
  const json = (await res.json()) as { resource: { booking_url: string } };
  return json.resource.booking_url;
}

/** Final provider URL for the client, pre-filled and tagged with the request ID for matching. */
export function providerBookingUrl(req: ConsultingRequest): string | null {
  if (!req.schedulingProviderUrl?.startsWith("http")) return null;
  const url = new URL(req.schedulingProviderUrl);
  url.searchParams.set("name", req.clientName);
  url.searchParams.set("email", req.email);
  url.searchParams.set("utm_source", "tim-consulting");
  url.searchParams.set("utm_content", req.id);
  return url.toString();
}

export function verifyCalendlySignature(rawBody: string, header: string | null, key = config.scheduling.calendlyWebhookSigningKey, toleranceSec = 300): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > toleranceSec) return false;
  const expected = createHmac("sha256", key).update(`${t}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface CalendlyPayload {
  event: "invitee.created" | "invitee.canceled" | string;
  payload: {
    email?: string;
    rescheduled?: boolean;
    tracking?: { utm_content?: string | null };
    scheduled_event?: { uri: string; start_time: string; location?: { join_url?: string; location?: string } };
  };
}

export function parseCalendlyEvent(body: CalendlyPayload): BookingEvent | null {
  const ev = body.payload?.scheduled_event;
  if (!ev) return null;
  const base = {
    requestId: body.payload.tracking?.utm_content ?? undefined,
    inviteeEmail: body.payload.email,
    eventId: ev.uri,
    startTime: ev.start_time,
    meetingUrl: ev.location?.join_url ?? ev.location?.location,
  };
  if (body.event === "invitee.created") return { kind: "booked", ...base };
  if (body.event === "invitee.canceled") return { kind: "canceled", ...base, rescheduled: Boolean(body.payload.rescheduled) };
  return null;
}

/** Cancel a booking that was not made through an approved request (enforces "no scheduling before Tim accepts"). */
export async function cancelUnapprovedBooking(eventUri: string, reason: string): Promise<void> {
  if (config.scheduling.driver === "builtin") return;
  const uuid = eventUri.split("/").pop();
  const res = await fetch(`https://api.calendly.com/scheduled_events/${uuid}/cancellation`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.scheduling.calendlyToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) throw new Error(`Calendly cancellation failed (${res.status})`);
}

