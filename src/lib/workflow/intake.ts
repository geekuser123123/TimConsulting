import "server-only";
import { config } from "../config";
import type { ConsultingRequest, NewConsultingRequest } from "../domain";
import type { IntakeData } from "../intake-schema";
import { copy } from "../messages";
import { notifyStaff, safely, sendEmail } from "../notify";
import { getStore } from "../store";
import { nowIso } from "./core";

/**
 * Website request → Tape.
 * 1. Find existing contact by email, then phone. 2. Update it, or create a new one.
 * 3. Create a new Consulting Request linked to the contact, status "Pending Staff Review".
 * 4. Notify staff (they screen it and send it on to Tim). 5. Confirm to the requester. Tim's schedule is never exposed here.
 */
export async function submitRequest(data: IntakeData, source = "Website – Work With Tim"): Promise<ConsultingRequest> {
  const store = getStore();
  const currentClient = data.currentClient === "yes";
  const contactFields = {
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email.trim().toLowerCase(),
    phone: data.phone,
    state: data.state,
  };

  const existing = await store.findContact(data.email, data.phone);
  const contact = existing
    ? await store.updateContact(existing.id, { ...contactFields, currentClient: existing.currentClient || currentClient })
    : await store.createContact({ ...contactFields, currentClient });

  const recordingConsent = data.recordingConsent === "yes";
  const at = nowIso();
  const draft: NewConsultingRequest = {
    status: "Pending Staff Review",
    contactId: contact.id,
    clientName: `${data.firstName} ${data.lastName}`.trim(),
    currentClient: currentClient || Boolean(existing?.currentClient),
    existingAcademyClient: data.academyClient === "yes",
    email: contactFields.email,
    phone: data.phone,
    state: data.state,
    requestDate: at,
    source,
    mainReason: data.mainReason,
    clientGoal: data.clientGoal,
    clientQuestion: data.clientQuestion,
    specificTransaction: data.specificTransaction === "yes",
    transactionSummary: data.transactionSummary || undefined,
    timingDeadline: data.timingDeadline,
    accountType: data.accountType || undefined,
    relatedEntities: data.relatedEntities || undefined,
    relatedParties: data.relatedParties || undefined,
    heardAbout: data.heardAbout,

    timDecision: "Pending",
    approvedToSchedule: false,
    schedulingLinkSent: false,
    callCompleted: false,
    reminder24hSent: false,
    reminder1hSent: false,
    schedulingReminderSent: false,

    recordingConsent,
    acknowledgedNoRelationship: data.acknowledgeNoRelationship,
    alternativeHandling: !recordingConsent,
    transcriptReceived: false,
    transcriptOverdueNotified: false,

    scopeStatus: "Not Started",
    paymentRequired: false,
    timScopeApproval: "Pending",
    proposalReminderSent: false,
    clientDecision: "Pending",
    engagementAgreementStatus: config.engagement.agreementRequired ? "Pending Signature" : "Not Required",
    paymentStatus: "Not Required",

    initialDocumentsRequired: config.engagement.initialDocumentsRequiredByDefault,
    initialDocumentsReceived: false,
    engagementComplete: false,
    matterOpened: false,

    auditLog: [
      {
        at,
        actor: "client",
        action: "Request submitted via website",
        detail: `${existing ? "matched existing contact" : "created new contact"}; recording consent: ${recordingConsent ? "yes" : "NO"}; acknowledged no attorney-client relationship: yes`,
      },
    ],
  };

  const created = await store.createRequest(draft);
  const consoleLink = `${config.siteUrl}/admin/staff/${created.id}`;

  await notifyStaff(
    `New discovery call request: ${created.clientName}${recordingConsent ? "" : " — NO RECORDING CONSENT"}`,
    `A new discovery call request from ${created.clientName}${created.currentClient ? " (current client)" : ""} is waiting for staff review.\n\nOpen it to read the submission, then send it to Tim for his decision or decline it:\n${consoleLink}${
      recordingConsent ? "" : "\n\nThe requester did NOT consent to recording/transcription. Do not auto-record. Alternative handling is required if Tim accepts."
    }`,
  );
  await safely("requester confirmation", () => sendEmail(created.email, copy.requestReceived.subject, copy.requestReceived.body(data.firstName)));

  return created;
}
