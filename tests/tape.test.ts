/**
 * The Tape adapter against a fake Tape API (tests/fake-tape.ts): workspace setup, value
 * encoding, contact matching, and a full consulting journey with Tape as the CRM.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeTape } from "./fake-tape";
import { freshEnv, submit, type FakeGateway } from "./helpers";
import { setStore } from "@/lib/store";
import { TapeStore } from "@/lib/store/tape";
import { AppSchema, decodeValue, encodeValue, htmlToText, TapeClient, type TapeAppField } from "@/lib/store/tape-core";
import { registerTapeWebhook, setupTapeWorkspace } from "@/lib/store/tape-setup";
import { REQUEST_FIELDS, TAPE_APPS } from "@/lib/store/tape-schema";
import { acceptRequest } from "@/lib/workflow/review";
import { handleBookingEvent } from "@/lib/workflow/booking";
import { receiveTranscript } from "@/lib/workflow/transcript";
import { approveScope, saveScopeDraft, submitScopeToTim } from "@/lib/workflow/scope";
import { acceptProposal, getPaymentUrl, recordPayment, signEngagement } from "@/lib/workflow/proposal";
import { reconcileRequest } from "@/lib/workflow/reconcile";

vi.mock("@/lib/summary", () => ({
  generateCallSummary: vi.fn(),
  SummaryUnavailableError: class extends Error {},
}));

let tape: FakeTape;
let client: TapeClient;

beforeEach(() => {
  tape = new FakeTape();
  client = new TapeClient({ baseUrl: "https://api.tape.test/v1", apiKey: "tape_pat_test", fetch: tape.fetch });
});

async function setup() {
  const { appIds, problems } = await setupTapeWorkspace(client, { workspaceId: 7 });
  expect(problems).toEqual([]);
  const store = new TapeStore({
    client,
    appIds: { contacts: String(appIds.contacts), requests: String(appIds.requests), matters: String(appIds.matters), tasks: String(appIds.tasks) },
  });
  return { appIds: appIds as Record<keyof typeof TAPE_APPS, number>, store };
}

describe("tape:setup", () => {
  it("creates the four apps with relations, and is a no-op when run again", async () => {
    const { appIds } = await setup();
    expect([...tape.apps.values()].map((a) => a.name)).toEqual(["Contacts", "Tim Consulting Requests", "Matters", "Matter Tasks"]);
    const requests = tape.apps.get(appIds.requests)!;
    expect(requests.fields).toHaveLength(Object.keys(REQUEST_FIELDS).length);
    const linked = requests.fields.find((f) => f.label === "Linked Contact")!;
    expect(linked.config.settings.referenced_apps).toEqual([{ app_id: appIds.contacts }]);
    const status = requests.fields.find((f) => f.label === "Status")!;
    expect(status.config.settings.options!.map((o) => o.text)).toContain("Pending Tim Review");

    const before = tape.calls.length;
    const again = await setupTapeWorkspace(client, { workspaceId: 7 });
    expect(again.appIds).toEqual(appIds);
    expect(tape.calls.slice(before).filter((c) => c.method !== "GET")).toEqual([]);
  });

  it("adds missing fields and dropdown options to an existing Contacts app", async () => {
    tape.createApp({
      workspace_id: 7,
      name: "Contacts",
      fields: [
        { field_type: "single_text", config: { label: "Full Name" } },
        { field_type: "multi_email", config: { label: "Email" } },
        { field_type: "single_category", config: { label: "Current Client", settings: { options: [{ text: "Yes" }] } } },
      ],
    });
    const { appIds, problems } = await setupTapeWorkspace(client, { workspaceId: 7 });
    expect(problems).toEqual([]);
    const contacts = tape.apps.get(appIds.contacts!)!;
    expect(contacts.fields.map((f) => f.label)).toEqual(["Full Name", "Email", "Current Client", "First Name", "Last Name", "Phone", "State"]);
    expect(contacts.fields[2].config.settings.options!.map((o) => o.text)).toEqual(["Yes", "No"]);
  });

  it("reports a field with the right name but the wrong type instead of guessing", async () => {
    tape.createApp({ workspace_id: 7, name: "Contacts", fields: [{ field_type: "number", config: { label: "Phone" } }] });
    const { problems } = await setupTapeWorkspace(client, { workspaceId: 7, includeTasks: false });
    expect(problems).toEqual([expect.stringContaining('Contacts → "Phone" is a number field')]);
  });

  it("registers and verifies the webhook, replacing one with an old secret", async () => {
    const { appIds } = await setup();
    await registerTapeWebhook(client, appIds.requests, "https://site.test/api/webhooks/tape?secret=old");
    const hook = await registerTapeWebhook(client, appIds.requests, "https://site.test/api/webhooks/tape?secret=new");
    const hooks = [...tape.hooks.values()];
    expect(hooks).toHaveLength(1);
    expect(hooks[0]).toMatchObject({ type: "record.update", url: "https://site.test/api/webhooks/tape?secret=new", code: `code${hook.hook_id}` });
    await client.validateHook(hook.hook_id, `code${hook.hook_id}`); // what /api/webhooks/tape does on hook.verify
    expect(tape.hooks.get(hook.hook_id)!.status).toBe("active");
  });
});

describe("Tape value codecs", () => {
  const field = (field_type: string, settings: Record<string, unknown> = {}): TapeAppField => ({ field_id: 1, external_id: "x", label: "X", field_type, config: { settings } });

  it("writes the formats Tape documents", () => {
    const status = field("single_category", { options: [{ id: 11, text: "Proposal Sent" }] });
    expect(encodeValue(REQUEST_FIELDS.status, status, "Proposal Sent")).toBe(11);
    expect(() => encodeValue(REQUEST_FIELDS.status, status, "Nope")).toThrow(/no option "Nope"/);
    expect(encodeValue(REQUEST_FIELDS.currentClient, field("single_category", { options: [{ id: 1, text: "Yes" }, { id: 2, text: "No" }] }), false)).toBe(2);
    expect(encodeValue(REQUEST_FIELDS.email, field("multi_email"), "a@b.co")).toEqual([{ type: "work", email: "a@b.co" }]);
    expect(encodeValue(REQUEST_FIELDS.phone, field("multi_phone"), "555")).toEqual([{ type: "mobile", phone: "555" }]);
    expect(encodeValue(REQUEST_FIELDS.scheduledAt, field("single_date"), "2030-01-15T16:00:00.000Z")).toBe("2030-01-15 16:00:00");
    expect(encodeValue(REQUEST_FIELDS.contactId, field("single_relation"), "42")).toBe(42);
    expect(encodeValue(REQUEST_FIELDS.meetingUrl, field("single_text"), "")).toBeNull();
    expect(encodeValue(REQUEST_FIELDS.clientGoal, field("multi_text", { formatted: true }), "a < b\n\nnext")).toBe("<p>a &lt; b</p><p>next</p>");
  });

  it("reads UTC dates, rich text and relations", () => {
    const d = decodeValue(REQUEST_FIELDS.scheduledAt, field("single_date"), {
      field_id: 1,
      values: [{ start: "2030-01-15 10:00:00", start_time: "10:00:00", start_utc: "2030-01-15 16:00:00", start_time_utc: "16:00:00" }],
    });
    expect(d).toBe("2030-01-15T16:00:00.000Z");
    expect(decodeValue(REQUEST_FIELDS.clientGoal, field("multi_text"), { field_id: 1, values: [{ value: "<p>One<br>Two &amp; three</p>" }] })).toBe("One\nTwo & three");
    expect(decodeValue(REQUEST_FIELDS.contactId, field("single_relation"), { field_id: 1, values: [{ value: { record_id: 42 } }] })).toBe("42");
    expect(decodeValue(REQUEST_FIELDS.currentClient, field("single_category"), undefined)).toBe(false);
    expect(htmlToText("<ul><li>a</li><li>b</li></ul>")).toBe("• a\n\n• b");
  });

  it("matches fields by label even when Tape's external IDs differ", () => {
    const app = { app_id: 1, fields: [{ field_id: 5, external_id: "diagnosis_client_goal", label: "diagnosis: client goal", field_type: "multi_text" }] };
    const s = new AppSchema(app, { diagClientGoal: REQUEST_FIELDS.diagClientGoal });
    expect(s.field("diagClientGoal").field_id).toBe(5);
  });
});

describe("TapeStore", () => {
  let gateway: FakeGateway;
  beforeEach(() => {
    ({ gateway } = freshEnv());
  });

  it("dedupes contacts by email (any case) or phone (any format)", async () => {
    const { store } = await setup();
    const c = await store.createContact({ firstName: "Jane", lastName: "Doe", email: "jane.doe@example.com", phone: "(555) 123-4567" });
    expect((await store.findContact("JANE.DOE@example.com", "000"))?.id).toBe(c.id);
    expect((await store.findContact("other@example.com", "+1 555.123.4567"))?.id).toBe(c.id);
    expect(await store.findContact("other@example.com", "555-999-4567")).toBeNull();
  });

  it("runs a full journey with Tape as the CRM", async () => {
    const { store, appIds } = await setup();
    setStore(store);

    const req = await submit();
    expect(req).toMatchObject({ status: "Pending Tim Review", clientName: "Jane Doe", recordingConsent: true, specificTransaction: true });
    expect(req.auditLog[0].action).toBe("Request submitted via website");
    expect(await store.listRequests(["Pending Tim Review"])).toHaveLength(1);

    // Tim clicks "Accept" in Tape → webhook → reconcile
    const requestsSchema = new AppSchema(await client.getApp(appIds.requests), REQUEST_FIELDS);
    await client.updateRecord(req.id, requestsSchema.encode({ timDecision: "Accept" }));
    expect((await reconcileRequest(req.id)).action).toBe("accepted");

    await handleBookingEvent({ kind: "booked", requestId: req.id, eventId: "evt_1", startTime: "2030-01-15T16:00:00Z", meetingUrl: "https://zoom.us/j/1" });
    expect((await store.findRequestBy("calendarEventId", "evt_1"))?.scheduledAt).toBe("2030-01-15T16:00:00.000Z");
    // A cancellation clears the appointment in Tape, then the client rebooks
    await handleBookingEvent({ kind: "canceled", requestId: req.id, eventId: "evt_1" });
    expect(await store.getRequest(req.id)).toMatchObject({ scheduledAt: undefined, calendarEventId: undefined, meetingUrl: undefined });
    await handleBookingEvent({ kind: "booked", requestId: req.id, eventId: "evt_1", startTime: "2030-01-15T16:00:00Z", meetingUrl: "https://zoom.us/j/1" });

    await receiveTranscript({ calendarEventId: "evt_1", transcriptText: "TIM: Hello\nCLIENT: Hi", recordingUrl: "https://rec.test/1" });
    await saveScopeDraft(req.id, {
      scopeSituation: "Duplex in an IRA.",
      scopeProposedWork: "Review structure.",
      scopeDeliverables: "Memo.",
      scopeExclusions: "Tax returns.",
      scopeClientResponsibilities: "Operating agreement.",
      feeType: "Fixed Fee",
      feeAmount: 1500,
      paymentRequired: true,
    });
    await submitScopeToTim(req.id);
    const approved = await approveScope(req.id);
    const token = approved.proposalUrl!.split("/proposal/")[1];
    await acceptProposal(token);
    await signEngagement(token, "Jane Doe");
    await getPaymentUrl((await store.getRequest(req.id))!);
    const paid = await recordPayment({ id: "cs_test_1", metadata: { consulting_request_id: req.id }, amount_total: 150000, currency: "usd", payment_status: "paid", payment_intent: "pi_1" });

    expect(paid).toMatchObject({ status: "Matter Active", paymentStatus: "Paid", amountPaid: 1500, matterOpened: true, transcriptText: "TIM: Hello\nCLIENT: Hi" });
    const final = (await store.getRequest(req.id))!;
    expect(final.auditLog.map((e) => e.action)).toEqual(expect.arrayContaining(["Request submitted via website", "Payment received via Stripe"]));
    expect(final.auditLog.length).toBeGreaterThan(8);

    const [matter] = tape.rows(appIds.matters);
    expect(matter["Consulting Request"]).toEqual([expect.objectContaining({ value: expect.objectContaining({ record_id: Number(req.id) }) })]);
    expect(tape.rows(appIds.tasks).length).toBeGreaterThan(0);
    expect(tape.hookedWrites).toBe(0); // every system write passes hook=false, so it never re-triggers our webhook
  });

  it("returns null for records that aren't consulting requests", async () => {
    const { store } = await setup();
    const c = await store.createContact({ firstName: "A", lastName: "B", email: "a@b.co", phone: "5551234567" });
    expect(await store.getRequest(c.id)).toBeNull();
    expect(await store.getRequest("req_abc")).toBeNull();
    expect(await store.getRequest("999999")).toBeNull();
  });
});
