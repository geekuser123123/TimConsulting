/**
 * Domain model for the Tim Berry Consulting System.
 *
 * One ConsultingRequest = one consulting matter/request. A returning client with a new
 * issue gets a new ConsultingRequest linked to the same Contact.
 *
 * Every field here maps 1:1 to a field in the Tape app "Tim Consulting Requests"
 * (see src/lib/store/tape-schema.ts and docs/TAPE_SETUP.md).
 */

export const PIPELINE_STATUSES = [
  "Pending Tim Review",
  "Declined by Tim",
  "Approved to Schedule",
  "Discovery Scheduled",
  "Discovery Completed",
  "Scope Being Prepared",
  "Pending Tim Scope Approval",
  "Proposal Sent",
  "Accepted - Payment Pending",
  "Accepted - Ready to Begin",
  "Proposal Declined",
  "Matter Active",
  "Closed",
] as const;
export type PipelineStatus = (typeof PIPELINE_STATUSES)[number];

/** Allowed moves for the single main pipeline field. Anything else is rejected. */
export const ALLOWED_TRANSITIONS: Record<PipelineStatus, readonly PipelineStatus[]> = {
  "Pending Tim Review": ["Declined by Tim", "Approved to Schedule", "Closed"],
  "Declined by Tim": ["Closed"],
  "Approved to Schedule": ["Discovery Scheduled", "Closed"],
  "Discovery Scheduled": ["Discovery Scheduled", "Approved to Schedule", "Discovery Completed", "Closed"],
  "Discovery Completed": ["Scope Being Prepared", "Closed"],
  "Scope Being Prepared": ["Pending Tim Scope Approval", "Closed"],
  "Pending Tim Scope Approval": ["Proposal Sent", "Scope Being Prepared", "Closed"],
  "Proposal Sent": ["Accepted - Payment Pending", "Accepted - Ready to Begin", "Proposal Declined", "Closed"],
  "Accepted - Payment Pending": ["Accepted - Ready to Begin", "Closed"],
  "Accepted - Ready to Begin": ["Matter Active", "Closed"],
  "Proposal Declined": ["Closed"],
  "Matter Active": ["Closed"],
  Closed: [],
};

export function canTransition(from: PipelineStatus, to: PipelineStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export const TIM_DECLINE_REASONS = [
  "Not attorney-level work",
  "Better handled by education/team",
  "Outside scope",
  "Insufficient information",
  "Conflict issue",
  "Capacity",
  "Other",
] as const;
export type TimDeclineReason = (typeof TIM_DECLINE_REASONS)[number];

export const CLIENT_DECLINE_REASONS = [
  "Price",
  "Timing",
  "Decided not to proceed",
  "Using another professional",
  "Scope did not match needs",
  "Other",
] as const;
export type ClientDeclineReason = (typeof CLIENT_DECLINE_REASONS)[number];

export type TimDecision = "Pending" | "Accept" | "Decline";
export type ScopeStatus = "Not Started" | "Drafting" | "Submitted to Tim" | "Needs Changes" | "Approved";
export type TimScopeApproval = "Pending" | "Approved" | "Needs Changes";
export type ClientDecision = "Pending" | "Accepted" | "Declined";
export type PaymentStatus = "Not Required" | "Unpaid" | "Paid" | "Refunded";
export type AttorneyWorkRequired = "Yes" | "No" | "Unclear";
export type FeeType = "Fixed Fee" | "Hourly" | "Retainer" | "No Charge";
export type EngagementAgreementStatus = "Not Required" | "Pending Signature" | "Signed";

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  state?: string;
  currentClient?: boolean;
}

export interface AuditEntry {
  at: string; // ISO timestamp
  actor: string; // "tim" | "staff" | "client" | "system" | "stripe" | ...
  action: string;
  detail?: string;
}

export interface ConsultingRequest {
  id: string;
  status: PipelineStatus;

  // Client
  contactId: string;
  clientName: string;
  currentClient: boolean;
  existingAcademyClient: boolean;
  email: string;
  phone: string;
  state: string;

  // Request
  requestDate: string;
  source: string;
  mainReason: string;
  clientGoal: string;
  clientQuestion: string;
  specificTransaction: boolean;
  transactionSummary?: string;
  timingDeadline?: string;
  accountType?: string;
  relatedEntities?: string;
  relatedParties?: string;
  heardAbout?: string;

  // Tim review
  timDecision: TimDecision;
  decisionDate?: string;
  declineReason?: TimDeclineReason;
  internalComments?: string;

  // Scheduling
  approvedToSchedule: boolean;
  schedulingLinkSent: boolean;
  schedulingLinkSentAt?: string;
  schedulingProviderUrl?: string; // single-use provider link; never shown until Tim accepts
  scheduleNonce?: string;
  scheduledAt?: string; // ISO
  meetingUrl?: string;
  calendarEventId?: string;
  callCompleted: boolean;
  reminder24hSent: boolean;
  reminder1hSent: boolean;
  schedulingReminderSent: boolean;

  // Recording
  recordingConsent: boolean;
  acknowledgedNoRelationship: boolean;
  alternativeHandling: boolean; // no recording consent → staff handles scheduling manually
  recordingUrl?: string;
  transcriptUrl?: string;
  transcriptText?: string;
  transcriptReceived: boolean;
  transcriptOverdueNotified: boolean;

  // Diagnosis (AI draft → staff edits; never final attorney analysis)
  diagClientGoal?: string;
  diagCurrentSituation?: string;
  diagKeyFacts?: string;
  diagPrimaryIssue?: string;
  diagSecondaryIssues?: string;
  diagFactsStillNeeded?: string;
  diagAttorneyWorkRequired?: AttorneyWorkRequired;
  diagRecommendedNextStep?: string;
  diagRecommendedDeliverable?: string;
  diagDocumentsNeeded?: string;
  summaryGeneratedAt?: string;

  // Scope (drafted by staff)
  scopeStatus: ScopeStatus;
  scopeSituation?: string; // "Your Situation" (plain English, client facing)
  scopeProposedWork?: string;
  scopeDeliverables?: string;
  scopeExclusions?: string;
  scopeClientResponsibilities?: string;
  scopeAdditionalServices?: string;
  feeType?: FeeType;
  feeAmount?: number; // USD
  paymentRequired: boolean;
  timScopeApproval: TimScopeApproval;
  timScopeNotes?: string;
  scopeApprovedAt?: string;

  // Proposal
  proposalNonce?: string;
  proposalUrl?: string;
  proposalSentDate?: string;
  proposalReminderSent: boolean;
  clientDecision: ClientDecision;
  acceptedDate?: string;
  declinedDate?: string;
  clientDeclineReason?: ClientDeclineReason;
  clientDeclineComment?: string;

  // Engagement agreement
  engagementAgreementStatus: EngagementAgreementStatus;
  engagementSignedName?: string;
  engagementSignedAt?: string;
  engagementSignedIp?: string;

  // Stripe
  stripeCustomerId?: string;
  stripeCheckoutId?: string;
  stripePaymentUrl?: string;
  stripePaymentUrlExpiresAt?: string;
  paymentStatus: PaymentStatus;
  amountPaid?: number;
  paymentDate?: string;
  stripePaymentId?: string;

  // Matter
  initialDocumentsRequired: boolean;
  initialDocumentsReceived: boolean;
  engagementComplete: boolean;
  matterOpened: boolean;
  matterId?: string;
  workStatus?: string;

  // Audit trail (acceptance, payment, Tim approvals, every status change)
  auditLog: AuditEntry[];
}

export type NewConsultingRequest = Omit<ConsultingRequest, "id">;
export type RequestPatch = Partial<Omit<ConsultingRequest, "id" | "auditLog">>;
