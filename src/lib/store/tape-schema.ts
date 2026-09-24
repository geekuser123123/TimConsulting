/**
 * Field map for the Tape apps.
 *
 * `npm run tape:setup` creates these fields in Tape using the labels below. At runtime each field
 * is matched to the live Tape field by label (case-insensitive), falling back to the external ID,
 * so staff can freely rename a field's *external ID* in Tape but should not rename its label
 * without also changing it here. `npm run tape:check` verifies the live workspace matches.
 *
 * `docs/TAPE_FIELDS.md` is generated from this list (`npm run tape:doc`).
 */
import {
  CLIENT_DECLINE_REASONS,
  PIPELINE_STATUSES,
  TIM_DECLINE_REASONS,
  type ConsultingRequest,
} from "../domain";

export type TapeFieldType = "text" | "long_text" | "email" | "phone" | "category" | "yes_no" | "date" | "number" | "relation";

export interface TapeFieldDef {
  externalId: string;
  label: string;
  type: TapeFieldType;
  section: string;
  options?: readonly string[];
  /** Hidden from Tim's views; staff/system only. */
  internal?: boolean;
  /** Stored as JSON text in Tape (arrays/objects). */
  json?: boolean;
  /** For relation fields: which of our apps the field points to. */
  relates?: TapeAppKey;
}

export type TapeAppKey = "contacts" | "requests" | "matters" | "tasks";

type RequestKey = Exclude<keyof ConsultingRequest, "id">;

export const REQUEST_FIELDS: Record<RequestKey, TapeFieldDef> = {
  status: { externalId: "status", label: "Status", type: "category", section: "Pipeline", options: PIPELINE_STATUSES },

  contactId: { externalId: "contact", label: "Linked Contact", type: "relation", section: "Client", relates: "contacts" },
  clientName: { externalId: "client_name", label: "Client Name", type: "text", section: "Client" },
  currentClient: { externalId: "current_client", label: "Current Client", type: "yes_no", section: "Client" },
  existingAcademyClient: { externalId: "academy_client", label: "IRA Ideas / Tax Academy Client", type: "yes_no", section: "Client" },
  email: { externalId: "email", label: "Email", type: "email", section: "Client" },
  phone: { externalId: "phone", label: "Phone", type: "phone", section: "Client" },
  state: { externalId: "state", label: "State", type: "text", section: "Client" },

  requestDate: { externalId: "request_date", label: "Request Date", type: "date", section: "Request" },
  source: { externalId: "source", label: "Source", type: "text", section: "Request" },
  mainReason: { externalId: "main_reason", label: "Main Reason for Call", type: "long_text", section: "Request" },
  clientGoal: { externalId: "client_goal", label: "Client Goal", type: "long_text", section: "Request" },
  clientQuestion: { externalId: "client_question", label: "Client Question", type: "long_text", section: "Request" },
  specificTransaction: { externalId: "specific_transaction", label: "Specific Transaction?", type: "yes_no", section: "Request" },
  transactionSummary: { externalId: "transaction_summary", label: "Transaction Summary", type: "long_text", section: "Request" },
  timingDeadline: { externalId: "timing_deadline", label: "Timing / Deadline", type: "text", section: "Request" },
  accountType: { externalId: "account_type", label: "Account Type", type: "text", section: "Request" },
  relatedEntities: { externalId: "related_entities", label: "Related Entities", type: "long_text", section: "Request" },
  relatedParties: { externalId: "related_parties", label: "Related Parties", type: "long_text", section: "Request" },
  heardAbout: { externalId: "heard_about", label: "How Did You Hear About Tim", type: "text", section: "Request" },

  timDecision: { externalId: "tim_decision", label: "Tim Decision", type: "category", section: "Tim Review", options: ["Pending", "Accept", "Decline"] },
  decisionDate: { externalId: "decision_date", label: "Decision Date", type: "date", section: "Tim Review" },
  declineReason: { externalId: "decline_reason", label: "Decline Reason", type: "category", section: "Tim Review", options: TIM_DECLINE_REASONS },
  internalComments: { externalId: "internal_comments", label: "Internal Comments", type: "long_text", section: "Tim Review" },

  approvedToSchedule: { externalId: "approved_to_schedule", label: "Approved to Schedule", type: "yes_no", section: "Scheduling" },
  schedulingLinkSent: { externalId: "scheduling_link_sent", label: "Scheduling Link Sent", type: "yes_no", section: "Scheduling" },
  schedulingLinkSentAt: { externalId: "scheduling_link_sent_at", label: "Scheduling Link Sent At", type: "date", section: "Scheduling", internal: true },
  schedulingProviderUrl: { externalId: "scheduling_provider_url", label: "Private Scheduling Link (provider)", type: "text", section: "Scheduling", internal: true },
  scheduleNonce: { externalId: "schedule_nonce", label: "Schedule Token Nonce", type: "text", section: "System", internal: true },
  scheduledAt: { externalId: "scheduled_at", label: "Scheduled Date/Time", type: "date", section: "Scheduling" },
  meetingUrl: { externalId: "meeting_url", label: "Meeting URL", type: "text", section: "Scheduling" },
  calendarEventId: { externalId: "calendar_event_id", label: "Calendar Event ID", type: "text", section: "Scheduling" },
  callCompleted: { externalId: "call_completed", label: "Call Completed", type: "yes_no", section: "Scheduling" },
  reminder24hSent: { externalId: "reminder_24h_sent", label: "24h Reminder Sent", type: "yes_no", section: "System", internal: true },
  reminder1hSent: { externalId: "reminder_1h_sent", label: "1h Reminder Sent", type: "yes_no", section: "System", internal: true },
  schedulingReminderSent: { externalId: "scheduling_reminder_sent", label: "Scheduling Reminder Sent", type: "yes_no", section: "System", internal: true },

  recordingConsent: { externalId: "recording_consent", label: "Recording Consent", type: "yes_no", section: "Recording" },
  acknowledgedNoRelationship: { externalId: "ack_no_relationship", label: "Acknowledged No Attorney-Client Relationship", type: "yes_no", section: "Recording" },
  alternativeHandling: { externalId: "alternative_handling", label: "Alternative Handling (No Recording)", type: "yes_no", section: "Recording" },
  recordingUrl: { externalId: "recording_url", label: "Recording URL", type: "text", section: "Recording" },
  transcriptUrl: { externalId: "transcript_url", label: "Transcript URL/File", type: "text", section: "Recording" },
  transcriptText: { externalId: "transcript_text", label: "Transcript", type: "long_text", section: "Recording", internal: true },
  transcriptReceived: { externalId: "transcript_received", label: "Transcript Received", type: "yes_no", section: "Recording" },
  transcriptOverdueNotified: { externalId: "transcript_overdue_notified", label: "Transcript Overdue Notified", type: "yes_no", section: "System", internal: true },

  diagClientGoal: { externalId: "diag_client_goal", label: "Diagnosis: Client Goal", type: "long_text", section: "Diagnosis" },
  diagCurrentSituation: { externalId: "diag_current_situation", label: "Diagnosis: Current Situation", type: "long_text", section: "Diagnosis" },
  diagKeyFacts: { externalId: "diag_key_facts", label: "Diagnosis: Key Facts", type: "long_text", section: "Diagnosis" },
  diagPrimaryIssue: { externalId: "diag_primary_issue", label: "Diagnosis: Primary Issue", type: "long_text", section: "Diagnosis" },
  diagSecondaryIssues: { externalId: "diag_secondary_issues", label: "Diagnosis: Secondary Issues", type: "long_text", section: "Diagnosis" },
  diagFactsStillNeeded: { externalId: "diag_facts_needed", label: "Diagnosis: Facts Still Needed", type: "long_text", section: "Diagnosis" },
  diagAttorneyWorkRequired: { externalId: "diag_attorney_work", label: "Diagnosis: Attorney Work Required?", type: "category", section: "Diagnosis", options: ["Yes", "No", "Unclear"] },
  diagRecommendedNextStep: { externalId: "diag_next_step", label: "Diagnosis: Recommended Next Step", type: "long_text", section: "Diagnosis" },
  diagRecommendedDeliverable: { externalId: "diag_deliverable", label: "Diagnosis: Recommended Deliverable", type: "long_text", section: "Diagnosis" },
  diagDocumentsNeeded: { externalId: "diag_documents_needed", label: "Diagnosis: Documents Needed", type: "long_text", section: "Diagnosis" },
  summaryGeneratedAt: { externalId: "summary_generated_at", label: "AI Draft Summary Generated At", type: "date", section: "Diagnosis", internal: true },

  scopeStatus: { externalId: "scope_status", label: "Scope Status", type: "category", section: "Scope", options: ["Not Started", "Drafting", "Submitted to Tim", "Needs Changes", "Approved"] },
  scopeSituation: { externalId: "scope_situation", label: "Scope: Your Situation (client-facing)", type: "long_text", section: "Scope" },
  scopeProposedWork: { externalId: "scope_draft", label: "Scope Draft / Proposed Work", type: "long_text", section: "Scope" },
  scopeDeliverables: { externalId: "deliverables", label: "Deliverables", type: "long_text", section: "Scope" },
  scopeExclusions: { externalId: "exclusions", label: "Exclusions", type: "long_text", section: "Scope" },
  scopeClientResponsibilities: { externalId: "client_responsibilities", label: "Client Responsibilities / Documents", type: "long_text", section: "Scope" },
  scopeAdditionalServices: { externalId: "additional_services", label: "Additional Services (separate engagement)", type: "long_text", section: "Scope" },
  feeType: { externalId: "fee_type", label: "Fee Type", type: "category", section: "Scope", options: ["Fixed Fee", "Hourly", "Retainer", "No Charge"] },
  feeAmount: { externalId: "fee_amount", label: "Fee Amount", type: "number", section: "Scope" },
  paymentRequired: { externalId: "payment_required", label: "Payment Required?", type: "yes_no", section: "Scope" },
  timScopeApproval: { externalId: "tim_approval", label: "Tim Approval", type: "category", section: "Scope", options: ["Pending", "Approved", "Needs Changes"] },
  timScopeNotes: { externalId: "tim_scope_notes", label: "Tim Scope Notes", type: "long_text", section: "Scope" },
  scopeApprovedAt: { externalId: "scope_approved_at", label: "Scope Approved At", type: "date", section: "Scope" },

  proposalNonce: { externalId: "proposal_nonce", label: "Proposal Token Nonce", type: "text", section: "System", internal: true },
  proposalUrl: { externalId: "proposal_url", label: "Proposal URL", type: "text", section: "Proposal" },
  proposalSentDate: { externalId: "proposal_sent_date", label: "Proposal Sent Date", type: "date", section: "Proposal" },
  proposalReminderSent: { externalId: "proposal_reminder_sent", label: "Proposal Reminder Sent", type: "yes_no", section: "System", internal: true },
  clientDecision: { externalId: "client_decision", label: "Client Decision", type: "category", section: "Proposal", options: ["Pending", "Accepted", "Declined"] },
  acceptedDate: { externalId: "accepted_date", label: "Accepted Date", type: "date", section: "Proposal" },
  declinedDate: { externalId: "declined_date", label: "Declined Date", type: "date", section: "Proposal" },
  clientDeclineReason: { externalId: "client_decline_reason", label: "Client Decline Reason", type: "category", section: "Proposal", options: CLIENT_DECLINE_REASONS },
  clientDeclineComment: { externalId: "client_decline_comment", label: "Client Decline Comment", type: "long_text", section: "Proposal" },

  engagementAgreementStatus: { externalId: "engagement_agreement_status", label: "Engagement Agreement", type: "category", section: "Engagement", options: ["Not Required", "Pending Signature", "Signed"] },
  engagementSignedName: { externalId: "engagement_signed_name", label: "Signed Name", type: "text", section: "Engagement" },
  engagementSignedAt: { externalId: "engagement_signed_at", label: "Signed At", type: "date", section: "Engagement" },
  engagementSignedIp: { externalId: "engagement_signed_ip", label: "Signed From IP", type: "text", section: "Engagement", internal: true },

  stripeCustomerId: { externalId: "stripe_customer_id", label: "Stripe Customer ID", type: "text", section: "Stripe" },
  stripeCheckoutId: { externalId: "stripe_checkout_id", label: "Stripe Invoice / Checkout ID", type: "text", section: "Stripe" },
  stripePaymentUrl: { externalId: "stripe_payment_url", label: "Stripe Payment URL", type: "text", section: "Stripe" },
  stripePaymentUrlExpiresAt: { externalId: "stripe_payment_url_expires", label: "Stripe Payment URL Expires", type: "date", section: "Stripe", internal: true },
  paymentStatus: { externalId: "payment_status", label: "Payment Status", type: "category", section: "Stripe", options: ["Not Required", "Unpaid", "Paid", "Refunded"] },
  amountPaid: { externalId: "amount_paid", label: "Amount Paid", type: "number", section: "Stripe" },
  paymentDate: { externalId: "payment_date", label: "Payment Date", type: "date", section: "Stripe" },
  stripePaymentId: { externalId: "stripe_payment_id", label: "Stripe Payment ID", type: "text", section: "Stripe" },

  initialDocumentsRequired: { externalId: "initial_docs_required", label: "Initial Documents Required Before Opening?", type: "yes_no", section: "Matter" },
  initialDocumentsReceived: { externalId: "initial_docs_received", label: "Initial Documents Received", type: "yes_no", section: "Matter" },
  engagementComplete: { externalId: "engagement_complete", label: "Engagement Complete?", type: "yes_no", section: "Matter" },
  matterOpened: { externalId: "matter_opened", label: "Matter Opened?", type: "yes_no", section: "Matter" },
  matterId: { externalId: "matter_id", label: "Matter / Project ID", type: "text", section: "Matter" },
  workStatus: { externalId: "work_status", label: "Work Status", type: "text", section: "Matter" },

  auditLog: { externalId: "audit_trail", label: "Audit Trail", type: "long_text", section: "Audit", internal: true, json: true },
};

export const CONTACT_FIELDS = {
  firstName: { externalId: "first_name", label: "First Name", type: "text", section: "Contact" },
  lastName: { externalId: "last_name", label: "Last Name", type: "text", section: "Contact" },
  email: { externalId: "email", label: "Email", type: "email", section: "Contact" },
  phone: { externalId: "phone", label: "Phone", type: "phone", section: "Contact" },
  state: { externalId: "state", label: "State", type: "text", section: "Contact" },
  currentClient: { externalId: "current_client", label: "Current Client", type: "yes_no", section: "Contact" },
} as const satisfies Record<string, TapeFieldDef>;

export const MATTER_FIELDS = {
  title: { externalId: "title", label: "Matter Title", type: "text", section: "Matter" },
  contactId: { externalId: "contact", label: "Client", type: "relation", section: "Matter", relates: "contacts" },
  requestId: { externalId: "consulting_request", label: "Consulting Request", type: "relation", section: "Matter", relates: "requests" },
  summary: { externalId: "summary", label: "Summary", type: "long_text", section: "Matter" },
  deliverables: { externalId: "deliverables", label: "Deliverables", type: "long_text", section: "Matter" },
} as const satisfies Record<string, TapeFieldDef>;

export const TASK_FIELDS = {
  title: { externalId: "title", label: "Task", type: "text", section: "Task" },
  matterId: { externalId: "matter", label: "Matter", type: "relation", section: "Task", relates: "matters" },
  requestId: { externalId: "consulting_request", label: "Consulting Request", type: "relation", section: "Task", relates: "requests" },
  assignee: { externalId: "assignee", label: "Assigned To", type: "category", section: "Task", options: ["staff", "tim"] },
  description: { externalId: "description", label: "Description", type: "long_text", section: "Task" },
} as const satisfies Record<string, TapeFieldDef>;

export const TAPE_APPS: Record<TapeAppKey, { name: string; itemName: string; envVar: string; fields: Record<string, TapeFieldDef>; optional?: boolean }> = {
  contacts: { name: "Contacts", itemName: "Contact", envVar: "TAPE_CONTACTS_APP_ID", fields: CONTACT_FIELDS },
  requests: { name: "Tim Consulting Requests", itemName: "Consulting Request", envVar: "TAPE_REQUESTS_APP_ID", fields: REQUEST_FIELDS },
  matters: { name: "Matters", itemName: "Matter", envVar: "TAPE_MATTERS_APP_ID", fields: MATTER_FIELDS },
  tasks: { name: "Matter Tasks", itemName: "Task", envVar: "TAPE_TASKS_APP_ID", fields: TASK_FIELDS, optional: true },
};
