/**
 * V1 acceptance tests — one `it` per item in the spec's section 28, run end-to-end against the
 * in-memory CRM with fake Stripe/scheduling providers.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { freshEnv, submit, emailsTo, extractLink, baseIntake, type FakeGateway } from "./helpers";
import type { MemoryStore } from "@/lib/store/memory";
import { intakeSchema } from "@/lib/intake-schema";
import { acceptRequest, declineRequest, resolveScheduleToken } from "@/lib/workflow/review";
import { handleBookingEvent } from "@/lib/workflow/booking";
import { receiveTranscript } from "@/lib/workflow/transcript";
import { approveScope, requestScopeChanges, saveScopeDraft, submitScopeToTim, type ScopeDraft } from "@/lib/workflow/scope";
import { acceptProposal, declineProposal, getPaymentUrl, recordPayment, resolveProposalToken, signEngagement } from "@/lib/workflow/proposal";
import { setInitialDocuments, engagementConditions } from "@/lib/workflow/matter";
import { reconcileRequest } from "@/lib/workflow/reconcile";
import { runSweep } from "@/lib/workflow/followups";
import { outbox } from "@/lib/notify";

vi.mock("@/lib/summary", () => ({
  generateCallSummary: vi.fn(async () => ({
    clientGoal: "Buy a duplex inside a self-directed IRA",
    currentSituation: "IRA funded; LLC formed; brother will manage",
    primaryIssue: "Brother's involvement may be a prohibited transaction",
    secondaryIssues: "UBIT if the property is financed",
    relevantFacts: "- Closing in 45 days\n- Non-recourse loan considered",
    factsDocumentsStillNeeded: "- LLC operating agreement\n- Purchase contract",
    attorneyWorkRequired: "Yes",
    recommendedWork: "Prohibited transaction analysis and LLC operating agreement review",
    recommendedDeliverable: "Written memo with recommended structure",
  })),
  SummaryUnavailableError: class extends Error {},
}));

let store: MemoryStore;
let gateway: FakeGateway;

beforeEach(() => {
  ({ store, gateway } = freshEnv());
  process.env.AI_SUMMARY_ENABLED = "false";
});

const scope: ScopeDraft = {
  scopeSituation: "You want to buy a duplex in your self-directed IRA and are unsure whether your brother's role is allowed.",
  scopeProposedWork: "Review the proposed structure and advise on prohibited-transaction risk.",
  scopeDeliverables: "A written memo with a recommended structure.",
  scopeExclusions: "Tax return preparation; representation before the IRS.",
  scopeClientResponsibilities: "LLC operating agreement; purchase contract.",
  feeType: "Fixed Fee",
  feeAmount: 1500,
  paymentRequired: true,
};

async function toScheduled() {
  const req = await submit();
  await acceptRequest(req.id);
  return handleBookingEvent({ kind: "booked", requestId: req.id, eventId: "evt_1", startTime: "2030-01-15T16:00:00Z", meetingUrl: "https://zoom.us/j/99887766" });
}

async function toProposal(draft: ScopeDraft = scope) {
  const req = await toScheduled();
  await receiveTranscript({ calendarEventId: "evt_1", transcriptText: "TIM: What are you trying to do? ...", recordingUrl: "https://rec.example/1" });
  await saveScopeDraft(req!.id, draft);
  await submitScopeToTim(req!.id);
  const approved = await approveScope(req!.id);
  const token = approved.proposalUrl!.split("/proposal/")[1];
  return { req: approved, token };
}

describe("V1 acceptance tests", () => {
  it("1. A website request creates the correct Tape contact/request", async () => {
    const req = await submit();
    expect(store.data.contacts).toHaveLength(1);
    expect(store.data.contacts[0]).toMatchObject({ firstName: "Jane", lastName: "Doe", email: "jane.doe@example.com", state: "Texas" });
    expect(req).toMatchObject({
      status: "Pending Tim Review",
      contactId: store.data.contacts[0].id,
      clientName: "Jane Doe",
      clientGoal: baseIntake.clientGoal,
      clientQuestion: baseIntake.clientQuestion,
      specificTransaction: true,
      accountType: "Self-directed IRA",
      recordingConsent: true,
      existingAcademyClient: true,
    });
    // Tim + staff notified; requester confirmed; no scheduling link exposed
    expect(emailsTo("tim@firm.test")).toHaveLength(1);
    expect(emailsTo("kevin@firm.test")).toHaveLength(1);
    const confirmation = emailsTo("jane.doe@example.com");
    expect(confirmation).toHaveLength(1);
    expect(confirmation[0].body).toContain("Tim reviews each request before scheduling");
    expect(confirmation[0].body).not.toContain("/schedule/");
  });

  it("2. Existing contacts are not duplicated (email or phone match)", async () => {
    const first = await submit();
    const second = await submit({ email: "JANE.DOE@example.com ", clientGoal: "A different issue six months later" });
    const third = await submit({ email: "jane.other@example.com", phone: "+1 555 123 4567" });
    expect(store.data.contacts).toHaveLength(1);
    expect(store.data.requests).toHaveLength(3);
    expect(new Set([first.contactId, second.contactId, third.contactId]).size).toBe(1);
  });

  it("3. Nobody can schedule Tim before Tim accepts", async () => {
    const req = await submit();
    expect(outbox().some((m) => m.body.includes("/schedule/"))).toBe(false);
    // A booking that didn't come through an approved request is rejected
    const result = await handleBookingEvent({ kind: "booked", requestId: req.id, eventId: "evt_x", startTime: "2030-01-01T15:00:00Z", inviteeEmail: req.email });
    expect(result).toBeNull();
    expect((await store.getRequest(req.id))!.status).toBe("Pending Tim Review");
    // Forged / pre-approval tokens do not resolve
    expect(await resolveScheduleToken("garbage.token")).toBeNull();
    const declined = await submit({ email: "other@example.com", phone: "5550000000" });
    await declineRequest(declined.id);
    expect(outbox().filter((m) => m.to === "other@example.com").some((m) => m.body.includes("/schedule/"))).toBe(false);
  });

  it("4. Tim can accept a request in one action", async () => {
    const req = await submit();
    const accepted = await acceptRequest(req.id);
    expect(accepted).toMatchObject({ status: "Approved to Schedule", timDecision: "Accept", approvedToSchedule: true, schedulingLinkSent: true });
    expect(accepted.decisionDate).toBeTruthy();
    // Same action from inside Tape (Tim Decision field → webhook → reconcile)
    const viaTape = await submit({ email: "t@example.com", phone: "5551112222" });
    await store.updateRequest(viaTape.id, { timDecision: "Accept" });
    expect((await reconcileRequest(viaTape.id)).request.status).toBe("Approved to Schedule");
  });

  it("5. Tim can decline a request in one action", async () => {
    const req = await submit();
    const declined = await declineRequest(req.id);
    expect(declined).toMatchObject({ status: "Declined by Tim", timDecision: "Decline" });
    const email = emailsTo(req.email).at(-1)!;
    expect(email.body).toContain("we will not be scheduling a discovery call with Tim at this time");
    const withReason = await submit({ email: "r@example.com", phone: "5553334444" });
    expect((await declineRequest(withReason.id, "Capacity")).declineReason).toBe("Capacity");
  });

  it("6. Accepted clients automatically receive the correct scheduling link (email + text)", async () => {
    const req = await submit();
    await acceptRequest(req.id);
    const email = emailsTo(req.email).find((m) => m.subject?.includes("approved"))!;
    expect(email.body).toContain("approved a 15-minute discovery call");
    const link = extractLink(email.body, "/work-with-tim/schedule/");
    const token = link.split("/schedule/")[1];
    const resolved = await resolveScheduleToken(token);
    expect(resolved?.id).toBe(req.id);
    expect(outbox().some((m) => m.channel === "sms" && m.to === "+15551234567" && m.body.includes(link))).toBe(true);
    // A token for one request can't be altered to reach another
    const other = await submit({ email: "o@example.com", phone: "5559990000" });
    await acceptRequest(other.id);
    const [payload, sig] = token.split(".");
    const tampered = Buffer.from(Buffer.from(payload, "base64url").toString().replace(req.id, other.id)).toString("base64url");
    expect(await resolveScheduleToken(`${tampered}.${sig}`)).toBeNull();
  });

  it("7. Booking updates Tape automatically", async () => {
    const booked = await toScheduled();
    expect(booked).toMatchObject({ status: "Discovery Scheduled", calendarEventId: "evt_1", meetingUrl: "https://zoom.us/j/99887766", scheduledAt: "2030-01-15T16:00:00.000Z" });
    const confirmation = emailsTo(booked!.email).find((m) => m.subject?.includes("confirmed"))!;
    expect(confirmation.body).toContain("15-minute discovery call designed to understand your situation");
    // 24h and 1h reminders, then auto-complete
    const start = Date.parse("2030-01-15T16:00:00Z");
    expect((await runSweep(new Date(start - 20 * 3600e3))).reminders24h).toBe(1);
    expect((await runSweep(new Date(start - 30 * 60e3))).reminders1h).toBe(1);
    expect((await runSweep(new Date(start - 20 * 60e3))).reminders1h).toBe(0);
    expect((await runSweep(new Date(start + 40 * 60e3))).callsCompleted).toBe(1);
    expect((await store.getRequest(booked!.id))!.status).toBe("Discovery Completed");
  });

  it("8. Recording consent is captured (and non-consent is routed to staff, never auto-recorded)", async () => {
    const yes = await submit();
    expect(yes.recordingConsent).toBe(true);
    expect(yes.acknowledgedNoRelationship).toBe(true);
    const no = await submit({ email: "n@example.com", phone: "5557778888", recordingConsent: "no" });
    expect(no).toMatchObject({ recordingConsent: false, alternativeHandling: true });
    await acceptRequest(no.id);
    expect(outbox().filter((m) => m.to === "n@example.com" || m.to === "+15557778888").some((m) => m.body.includes("/schedule/"))).toBe(false);
    expect(store.data.tasks.some((t) => t.requestId === no.id && t.title.includes("non-recorded"))).toBe(true);
    await expect(receiveTranscript({ requestId: no.id, transcriptText: "..." })).rejects.toThrow(/consent/);
    // Consent acknowledgement is mandatory
    expect(intakeSchema.safeParse({ ...baseIntake, acknowledgeNoRelationship: false }).success).toBe(false);
  });

  it("9. Call recording/transcript attaches to the correct request", async () => {
    const other = await submit({ email: "x@example.com", phone: "5551231234" });
    await acceptRequest(other.id);
    await handleBookingEvent({ kind: "booked", requestId: other.id, eventId: "evt_other", startTime: "2030-01-16T16:00:00Z", meetingUrl: "https://zoom.us/j/11112222" });
    const booked = await toScheduled();
    const updated = await receiveTranscript({ meetingId: "99887766", recordingUrl: "https://rec.example/jane", transcriptUrl: "https://rec.example/jane.vtt", transcriptText: "..." });
    expect(updated.id).toBe(booked!.id);
    expect(updated).toMatchObject({ transcriptReceived: true, recordingUrl: "https://rec.example/jane", callCompleted: true, status: "Scope Being Prepared" });
    expect((await store.getRequest(other.id))!.transcriptReceived).toBe(false);
    // Transcript is never emailed
    expect(outbox().some((m) => m.body.includes("TIM:") || m.body.includes("..."))).toBe(false);
  });

  it("10. Staff can draft the scope without asking Tim to recreate the conversation", async () => {
    process.env.AI_SUMMARY_ENABLED = "true";
    const booked = await toScheduled();
    const r = await receiveTranscript({ calendarEventId: "evt_1", transcriptText: "TIM: ... CLIENT: ..." });
    expect(r).toMatchObject({
      diagPrimaryIssue: "Brother's involvement may be a prohibited transaction",
      diagAttorneyWorkRequired: "Yes",
      diagRecommendedDeliverable: "Written memo with recommended structure",
      status: "Scope Being Prepared",
    });
    expect(r.transcriptText).toBeTruthy();
    const saved = await saveScopeDraft(booked!.id, scope);
    expect(saved.scopeProposedWork).toBe(scope.scopeProposedWork);
    await expect(submitScopeToTim(booked!.id)).resolves.toMatchObject({ status: "Pending Tim Scope Approval" });
    expect(emailsTo("tim@firm.test").some((m) => m.subject?.startsWith("Scope waiting"))).toBe(true);
  });

  it("11. Tim can approve the scope in one action (or send it back in one action)", async () => {
    const booked = await toScheduled();
    await receiveTranscript({ calendarEventId: "evt_1", transcriptText: "..." });
    await saveScopeDraft(booked!.id, scope);
    await submitScopeToTim(booked!.id);
    const back = await requestScopeChanges(booked!.id, "Add UBIT analysis");
    expect(back).toMatchObject({ status: "Scope Being Prepared", timScopeApproval: "Needs Changes", timScopeNotes: "Add UBIT analysis" });
    await saveScopeDraft(booked!.id, { scopeProposedWork: `${scope.scopeProposedWork} Includes UBIT analysis.` });
    await submitScopeToTim(booked!.id);
    const approved = await approveScope(booked!.id);
    expect(approved).toMatchObject({ status: "Proposal Sent", timScopeApproval: "Approved", scopeStatus: "Approved" });
  });

  it("12. Client receives a secure proposal link", async () => {
    const { req, token } = await toProposal();
    const email = emailsTo(req.email).find((m) => m.subject?.includes("proposed scope"))!;
    expect(email.body).toContain(`/work-with-tim/proposal/${token}`);
    expect(token.length).toBeGreaterThan(100);
    expect((await resolveProposalToken(token))?.id).toBe(req.id);
    expect(await resolveProposalToken(token.slice(0, -2) + "xx")).toBeNull();
    // Proposal links do not work before Tim approves
    const early = await submit({ email: "e@example.com", phone: "5554443333" });
    expect(early.proposalUrl).toBeUndefined();
  });

  it("13. Client can accept or decline", async () => {
    const a = await toProposal();
    const accepted = await acceptProposal(a.token, { ip: "203.0.113.5" });
    expect(accepted).toMatchObject({ clientDecision: "Accepted", status: "Accepted - Payment Pending" });
    expect(accepted.auditLog.some((e) => e.action === "Client accepted proposal" && e.detail?.includes("203.0.113.5"))).toBe(true);

    ({ store, gateway } = freshEnv());
    const d = await toProposal();
    const declined = await declineProposal(d.token, "Price", "Too expensive right now");
    expect(declined).toMatchObject({ status: "Proposal Declined", clientDecision: "Declined", clientDeclineReason: "Price" });
    // No further automatic sales pressure
    outbox().length = 0;
    await runSweep(new Date(Date.now() + 30 * 86400e3));
    expect(emailsTo(d.req.email)).toHaveLength(0);
  });

  it("14. A client who accepts and owes money receives the correct Stripe payment option", async () => {
    const { req, token } = await toProposal();
    let r = await acceptProposal(token);
    expect(await getPaymentUrl(r)).toBeNull(); // engagement agreement must be signed first
    r = await signEngagement(token, "Jane Q. Doe");
    const url = await getPaymentUrl(r);
    expect(url).toMatch(/^https:\/\/checkout\.stripe\.test\//);
    expect(gateway.created).toEqual([{ requestId: req.id, amount: 1500 }]);
    const stored = (await store.getRequest(req.id))!;
    expect(stored).toMatchObject({ stripePaymentUrl: url, stripeCheckoutId: "cs_test_1", paymentStatus: "Unpaid" });
    // Re-visiting reuses the unexpired link
    expect(await getPaymentUrl(stored)).toBe(url);
    expect(gateway.created).toHaveLength(1);
  });

  it("15. Successful Stripe payment updates Tape automatically", async () => {
    const { req, token } = await toProposal();
    await acceptProposal(token);
    await signEngagement(token, "Jane Doe");
    await getPaymentUrl((await store.getRequest(req.id))!);
    const paid = await recordPayment({ id: "cs_test_1", metadata: { consulting_request_id: req.id }, amount_total: 150000, currency: "usd", payment_status: "paid", payment_intent: "pi_123", customer: "cus_test_1" });
    expect(paid).toMatchObject({ paymentStatus: "Paid", amountPaid: 1500, stripePaymentId: "pi_123" });
    expect(paid!.paymentDate).toBeTruthy();
    expect(paid!.status).toBe("Matter Active"); // passed through Accepted - Ready to Begin
    expect(paid!.auditLog.some((e) => e.action === "Payment received via Stripe" && e.detail?.includes("Accepted - Ready to Begin"))).toBe(true);
    // Webhook retries are harmless
    await recordPayment({ id: "cs_test_1", metadata: { consulting_request_id: req.id }, amount_total: 150000, currency: "usd", payment_status: "paid" });
    expect(store.data.matters).toHaveLength(1);
  });

  it("16. No-payment engagements bypass Stripe", async () => {
    const { token, req } = await toProposal({ ...scope, feeType: "No Charge", feeAmount: 0, paymentRequired: false });
    const accepted = await acceptProposal(token);
    expect(accepted.status).toBe("Accepted - Ready to Begin");
    expect(accepted.paymentStatus).toBe("Not Required");
    const signed = await signEngagement(token, "Jane Doe");
    expect(signed.status).toBe("Matter Active");
    expect(await getPaymentUrl(signed)).toBeNull();
    expect(gateway.created).toHaveLength(0);
    expect(req.stripePaymentUrl).toBeUndefined();
  });

  it("17. A matter is not opened until all required engagement conditions are complete", async () => {
    const { req, token } = await toProposal();
    await store.updateRequest(req.id, { initialDocumentsRequired: true });
    await acceptProposal(token);
    expect(store.data.matters).toHaveLength(0); // not signed, not paid
    await signEngagement(token, "Jane Doe");
    expect(store.data.matters).toHaveLength(0); // not paid
    await recordPayment({ id: "cs_1", metadata: { consulting_request_id: req.id }, amount_total: 150000, currency: "usd", payment_status: "paid" });
    let r = (await store.getRequest(req.id))!;
    expect(r.status).toBe("Accepted - Ready to Begin");
    expect(store.data.matters).toHaveLength(0); // documents outstanding
    expect(engagementConditions(r).filter((c) => c.applies && !c.met).map((c) => c.label)).toEqual(["Initial documents received"]);
    r = await setInitialDocuments(req.id, { received: true });
    expect(r).toMatchObject({ status: "Matter Active", matterOpened: true, engagementComplete: true });
    expect(store.data.matters).toHaveLength(1);
    expect(store.data.matters[0].requestId).toBe(req.id); // linked back to the Consulting Request
    const tasks = store.data.tasks.filter((t) => t.matterId === r.matterId);
    expect(tasks.some((t) => t.assignee === "tim")).toBe(true);
    expect(tasks.some((t) => t.assignee === "staff")).toBe(true);
    expect(emailsTo(req.email).some((m) => m.body.includes("Your engagement is active"))).toBe(true);
    // Underpayment never opens a matter
    ({ store, gateway } = freshEnv());
    const u = await toProposal();
    await acceptProposal(u.token);
    await signEngagement(u.token, "Jane Doe");
    await recordPayment({ id: "cs_2", metadata: { consulting_request_id: u.req.id }, amount_total: 100, currency: "usd", payment_status: "paid" });
    expect((await store.getRequest(u.req.id))!.paymentStatus).toBe("Unpaid");
  });

  it("18. Every step is visible from one Tape Consulting Request record", async () => {
    const { req, token } = await toProposal();
    await acceptProposal(token);
    await signEngagement(token, "Jane Doe");
    await recordPayment({ id: "cs_1", metadata: { consulting_request_id: req.id }, amount_total: 150000, currency: "usd", payment_status: "paid" });
    const r = (await store.getRequest(req.id))!;
    const actions = r.auditLog.map((e) => e.action);
    for (const step of [
      "Request submitted via website",
      "Tim accepted discovery request",
      "Private scheduling link sent (email + text)",
      "Discovery call booked",
      "Recording/transcript attached",
      "Scope submitted to Tim for approval",
      "Tim approved scope — proposal generated and sent",
      "Client accepted proposal",
      "Client signed engagement agreement",
      "Payment received via Stripe",
      "All engagement conditions met — matter opened",
    ]) {
      expect(actions).toContain(step);
    }
    expect(r).toMatchObject({ calendarEventId: "evt_1", transcriptReceived: true, proposalUrl: expect.any(String), paymentStatus: "Paid", matterOpened: true });
  });

  it("19. Tim does not have to manually take notes for the system to function", async () => {
    process.env.AI_SUMMARY_ENABLED = "true";
    const booked = await toScheduled();
    // Only a transcript arrives; Tim enters nothing.
    const r = await receiveTranscript({ calendarEventId: "evt_1", transcriptText: "..." });
    expect(r.internalComments).toBeUndefined();
    for (const f of ["diagClientGoal", "diagCurrentSituation", "diagPrimaryIssue", "diagKeyFacts", "diagFactsStillNeeded", "diagRecommendedNextStep"] as const) {
      expect(r[f], f).toBeTruthy();
    }
    expect(booked!.id).toBe(r.id);
  });

  it("20. Tim does not have to remember to follow up for the system to function", async () => {
    // Approved but not booked → automatic reminder
    const req = await submit();
    await acceptRequest(req.id);
    outbox().length = 0;
    const res1 = await runSweep(new Date(Date.now() + 4 * 86400e3));
    expect(res1.schedulingReminders).toBe(1);
    expect(emailsTo(req.email)[0].body).toContain("/work-with-tim/schedule/");
    // Proposal not answered → one reminder; call done with no transcript → staff alerted
    ({ store, gateway } = freshEnv());
    const p = await toProposal();
    const res2 = await runSweep(new Date(Date.now() + 4 * 86400e3));
    expect(res2.proposalReminders).toBe(1);
    expect((await runSweep(new Date(Date.now() + 8 * 86400e3))).proposalReminders).toBe(0);
    expect(p.req.status).toBe("Proposal Sent");

    ({ store, gateway } = freshEnv());
    const s = await toScheduled();
    await runSweep(new Date(Date.parse(s!.scheduledAt!) + 40 * 60e3));
    const res3 = await runSweep(new Date(Date.parse(s!.scheduledAt!) + 6 * 3600e3));
    expect(res3.transcriptAlerts).toBe(1);
    // None of these went to Tim
    expect(outbox().filter((m) => m.to === "tim@firm.test" && /Transcript missing|Reminder/.test(m.subject ?? ""))).toHaveLength(0);
  });
});
