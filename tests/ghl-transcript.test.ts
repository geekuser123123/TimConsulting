/**
 * GoHighLevel phone calls: GHL's "Transcript Generated" workflow posts the transcript with the
 * contact's phone/email and the X-Webhook-Secret header; the site finds the booked call.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { freshEnv, submit } from "./helpers";
import type { MemoryStore } from "@/lib/store/memory";
import { acceptRequest } from "@/lib/workflow/review";
import { handleBookingEvent } from "@/lib/workflow/booking";
import { POST } from "@/app/api/webhooks/transcript/route";

const SECRET = "ghl-test-secret";
let store: MemoryStore;

beforeEach(() => {
  ({ store } = freshEnv());
  process.env.TRANSCRIPT_WEBHOOK_SECRET = SECRET;
});

const inHours = (h: number) => new Date(Date.now() + h * 3600e3).toISOString();

async function booked(startTime: string, overrides: Parameters<typeof submit>[0] = {}) {
  const req = await submit(overrides);
  await acceptRequest(req.id);
  const phone = (overrides.phone ?? "(555) 123-4567").replace(/\D/g, "");
  return (await handleBookingEvent({ kind: "booked", requestId: req.id, eventId: `call-${req.id}`, startTime, meetingUrl: `tel:+1${phone}` }))!;
}

function ghl(body: unknown, secret: string | null = SECRET) {
  return POST(
    new Request("https://consulting.test/api/webhooks/transcript", {
      method: "POST",
      headers: { "content-type": "application/json", ...(secret ? { "x-webhook-secret": secret } : {}) },
      body: JSON.stringify(body),
    }),
  );
}

describe("GoHighLevel call transcripts", () => {
  it("attaches the transcript to the client's booked call, matched by phone", async () => {
    const req = await booked(inHours(-0.5));
    const res = await ghl({ phone: "+1 555-123-4567", email: "", customData: { transcript: "<p><strong>A:</strong> Hi Jane</p><br><p><strong>B:</strong> Hello</p>", recording_url: "https://rec.ghl.test/1.mp3" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, requestId: req.id });
    expect(await store.getRequest(req.id)).toMatchObject({
      transcriptReceived: true,
      transcriptText: "A: Hi Jane\n\nB: Hello",
      recordingUrl: "https://rec.ghl.test/1.mp3",
      status: "Scope Being Prepared",
    });
  });

  it("matches by email when the phone differs", async () => {
    const req = await booked(inHours(-1));
    const res = await ghl({ phone: "+1 999 000 1111", email: "JANE.DOE@example.com", customData: { transcript: "A: hi" } });
    expect(await res.json()).toMatchObject({ ok: true, requestId: req.id });
  });

  it("ignores calls that aren't a booked discovery call happening now", async () => {
    const later = await booked(inHours(72)); // call is days away
    const res = await ghl({ phone: "5551234567", customData: { transcript: "A: unrelated call" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, action: "ignored" });
    expect((await store.getRequest(later.id))!.transcriptReceived).toBe(false);

    const stranger = await ghl({ phone: "5550000000", customData: { transcript: "A: someone else" } });
    expect(await stranger.json()).toMatchObject({ action: "ignored" });
  });

  it("picks the right client when two calls are booked", async () => {
    const jane = await booked(inHours(-0.5));
    const bob = await booked(inHours(-0.2), { firstName: "Bob", email: "bob@example.com", phone: "(555) 987-6543" });
    const res = await ghl({ phone: "555-987-6543", customData: { transcript: "A: Bob's call" } });
    expect(await res.json()).toMatchObject({ requestId: bob.id });
    expect((await store.getRequest(jane.id))!.transcriptReceived).toBe(false);
  });

  it("rejects a transcript for a client who did not consent to recording", async () => {
    // Non-consenting clients can't book online; staff arrange the call by hand.
    const req = await submit({ recordingConsent: "no" });
    await store.updateRequest(req.id, { status: "Discovery Scheduled", scheduledAt: inHours(-0.5), meetingUrl: "tel:+15551234567" });
    const res = await ghl({ phone: "5551234567", customData: { transcript: "A: should not be stored" } });
    expect(res.status).toBe(409);
    expect((await store.getRequest(req.id))!.transcriptText).toBeFalsy();
  });

  it("copes with GHL's unescaped merge values (quotes and line breaks in the transcript)", async () => {
    const req = await booked(inHours(-0.5));
    const raw = `{\n  "phone": "+15551234567",\n  "email": "jane.doe@example.com",\n  "transcript": "Tim: Hello, Jane.\nJane: He said "maybe" about the LLC.\nTim: OK."\n}`;
    const res = await POST(new Request("https://consulting.test/api/webhooks/transcript", { method: "POST", headers: { "x-webhook-secret": SECRET }, body: raw }));
    expect(await res.json()).toMatchObject({ ok: true, requestId: req.id });
    expect((await store.getRequest(req.id))!.transcriptText).toBe('Tim: Hello, Jane.\nJane: He said "maybe" about the LLC.\nTim: OK.');
  });

  it("requires the secret", async () => {
    await booked(inHours(-0.5));
    expect((await ghl({ phone: "5551234567", customData: { transcript: "A: x" } }, null)).status).toBe(401);
    expect((await ghl({ phone: "5551234567", customData: { transcript: "A: x" } }, "wrong")).status).toBe(401);
  });
});
