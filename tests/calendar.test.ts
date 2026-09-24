/**
 * Built-in calendar: Tim's availability (Mon/Tue/Thu 9:30–2:45 Central), booking by phone,
 * double-booking protection, rescheduling, cancelling, and calendar invites.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { freshEnv, submit, emailsTo } from "./helpers";
import { generateSlots, groupByDay, removeBooked, zonedTimeToUtc, type Availability } from "@/lib/availability";
import { buildIcs } from "@/lib/ics";
import { outbox } from "@/lib/notify";
import { acceptRequest } from "@/lib/workflow/review";
import { bookSlot, cancelSlot, clientCanChange, openSlots } from "@/lib/workflow/booking";
import type { MemoryStore } from "@/lib/store/memory";

const tim: Availability = {
  timeZone: "America/Chicago",
  days: ["mon", "tue", "thu"],
  start: "09:30",
  end: "14:45",
  intervalMinutes: 30,
  durationMinutes: 15,
  minNoticeHours: 24,
  daysAhead: 21,
  blockedDates: [],
};

describe("availability", () => {
  it("converts Central wall-clock time to UTC across daylight saving", () => {
    expect(zonedTimeToUtc("2026-07-06", "09:30", "America/Chicago").toISOString()).toBe("2026-07-06T14:30:00.000Z"); // CDT, UTC-5
    expect(zonedTimeToUtc("2026-12-07", "09:30", "America/Chicago").toISOString()).toBe("2026-12-07T15:30:00.000Z"); // CST, UTC-6
  });

  it("offers only Mon/Tue/Thu, 9:30 to 2:30 starts (last call ends 2:45), after 24h notice", () => {
    const now = new Date("2026-10-05T12:00:00Z"); // Monday 7:00 AM CDT
    const slots = generateSlots(tim, now);
    const days = groupByDay(slots, tim.timeZone);
    const weekday = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: tim.timeZone, weekday: "short" }).format(new Date(iso));
    expect(new Set(slots.map(weekday))).toEqual(new Set(["Mon", "Tue", "Thu"]));
    // Monday itself is inside the 24h notice window; Tuesday is the first day with slots
    expect(days[0].date).toBe("2026-10-06");
    expect(days[0].slots).toHaveLength(11);
    const time = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: tim.timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
    expect(time(days[0].slots[0])).toBe("9:30 AM");
    expect(time(days[0].slots.at(-1)!)).toBe("2:30 PM");
    expect(slots.every((s) => Date.parse(s) >= now.getTime() + 24 * 3600e3)).toBe(true);
  });

  it("skips blocked dates and removes booked times", () => {
    const now = new Date("2026-10-05T12:00:00Z");
    const slots = generateSlots({ ...tim, blockedDates: ["2026-10-06"] }, now);
    expect(groupByDay(slots, tim.timeZone)[0].date).toBe("2026-10-08");
    const open = removeBooked(slots, [slots[0]], 15);
    expect(open).not.toContain(slots[0]);
    expect(open).toHaveLength(slots.length - 1);
  });

  it("builds a calendar invite that can later be cancelled", () => {
    const ics = buildIcs({ uid: "discovery-1@x", start: "2026-10-06T14:30:00Z", minutes: 15, summary: "Call, Jane; test", description: "Line 1\nLine 2", organizerEmail: "c@mail.test", attendeeEmail: "tim@x.test" });
    expect(ics).toContain("METHOD:REQUEST");
    expect(ics).toContain("DTSTART:20261006T143000Z");
    expect(ics).toContain("DTEND:20261006T144500Z");
    expect(ics).toContain(String.raw`SUMMARY:Call\, Jane\; test`);
    expect(buildIcs({ uid: "discovery-1@x", start: "2026-10-06T14:30:00Z", minutes: 15, summary: "s", description: "d", organizerEmail: "c@mail.test", attendeeEmail: "t@x.test", cancel: true })).toContain("METHOD:CANCEL");
  });
});

describe("booking on the built-in calendar", () => {
  let store: MemoryStore;
  beforeEach(() => {
    ({ store } = freshEnv());
    vi.useRealTimers();
  });

  async function approved(overrides = {}) {
    const req = await submit(overrides);
    return acceptRequest(req.id);
  }

  it("books by phone, emails invites to client and Tim, and blocks the time for others", async () => {
    const jane = await approved();
    const slots = await openSlots(jane.id);
    outbox().length = 0;

    const booked = await bookSlot(jane.id, slots[0], "(555) 123-4567");
    expect(booked).toMatchObject({ status: "Discovery Scheduled", scheduledAt: slots[0], meetingUrl: "tel:+15551234567" });

    const [confirm] = emailsTo(jane.email);
    expect(confirm.body).toContain("Tim will call you at (555) 123-4567");
    expect(confirm.body).toContain("/work-with-tim/schedule/");
    expect(confirm.attachments).toEqual(["discovery-call.ics"]);
    expect(emailsTo("tim@firm.test")[0]).toMatchObject({ attachments: ["discovery-call.ics"] });
    expect(emailsTo("tim@firm.test")[0].body).toContain("+15551234567");

    // Another client can't take the same time
    const bob = await approved({ email: "bob@example.com", phone: "555-222-3333" });
    expect(await openSlots(bob.id)).not.toContain(slots[0]);
    await expect(bookSlot(bob.id, slots[0], "555-222-3333")).rejects.toThrow(/no longer available/);
  });

  it("rejects times outside Tim's hours and bad phone numbers", async () => {
    const jane = await approved();
    await expect(bookSlot(jane.id, "2030-01-05T18:00:00.000Z", "555-123-4567")).rejects.toThrow(/no longer available/); // a Saturday
    const [slot] = await openSlots(jane.id);
    await expect(bookSlot(jane.id, slot, "12")).rejects.toThrow(/valid phone/);
  });

  it("uses an updated phone number for the call", async () => {
    const jane = await approved();
    const [slot] = await openSlots(jane.id);
    const r = await bookSlot(jane.id, slot, "(555) 999-8888");
    expect(r).toMatchObject({ phone: "(555) 999-8888", meetingUrl: "tel:+15559998888" });
    expect(r!.auditLog.some((e) => e.action === "Updated phone number for the call")).toBe(true);
  });

  it("lets the client reschedule and cancel before the cut-off, then rebook", async () => {
    const jane = await approved();
    const slots = await openSlots(jane.id);
    await bookSlot(jane.id, slots[0], "555-123-4567");

    const moved = await bookSlot(jane.id, slots[3], "555-123-4567");
    expect(moved).toMatchObject({ status: "Discovery Scheduled", scheduledAt: slots[3] });
    expect(moved!.auditLog.some((e) => e.action === "Discovery call rescheduled")).toBe(true);
    expect(await openSlots("someone-else")).toContain(slots[0]); // old time freed

    outbox().length = 0;
    const cancelled = await cancelSlot(jane.id);
    expect(cancelled).toMatchObject({ status: "Approved to Schedule", scheduledAt: undefined });
    expect(emailsTo("tim@firm.test")[0]).toMatchObject({ attachments: ["discovery-call.ics"] });
    expect(emailsTo(jane.email)[0].subject).toMatch(/cancelled/);

    expect(await bookSlot(jane.id, slots[5], "555-123-4567")).toMatchObject({ status: "Discovery Scheduled", scheduledAt: slots[5] });
  });

  it("doesn't allow online changes inside the notice window", async () => {
    const jane = await approved();
    const [slot] = await openSlots(jane.id);
    const r = (await bookSlot(jane.id, slot, "555-123-4567"))!;
    const justBefore = new Date(Date.parse(slot) - 2 * 3600e3);
    expect(clientCanChange(r, justBefore)).toBe(false);
    expect(clientCanChange(r)).toBe(true);
    await store.updateRequest(r.id, { scheduledAt: new Date(Date.now() + 3600e3).toISOString() });
    await expect(cancelSlot(r.id)).rejects.toThrow(/too soon/);
  });
});
