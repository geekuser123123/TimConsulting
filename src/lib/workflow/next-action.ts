import type { ConsultingRequest } from "../domain";

/** What (if anything) a human needs to do next, and who. Drives the staff console. */
export function nextAction(r: ConsultingRequest): { who: "Tim" | "Staff" | "Client" | "System" | "—"; what: string } {
  switch (r.status) {
    case "Pending Tim Review":
      return { who: "Tim", what: "Accept or decline request" };
    case "Declined by Tim":
      return { who: "Staff", what: "Route elsewhere if appropriate, then close" };
    case "Approved to Schedule":
      return r.alternativeHandling
        ? { who: "Staff", what: "Arrange non-recorded call manually" }
        : { who: "Client", what: "Choose a time (link sent)" };
    case "Discovery Scheduled":
      return { who: "System", what: "Reminders; call" };
    case "Discovery Completed":
      return r.recordingConsent ? { who: "System", what: "Waiting for transcript" } : { who: "Staff", what: "Start scope (call not recorded)" };
    case "Scope Being Prepared":
      return { who: "Staff", what: r.scopeStatus === "Needs Changes" ? "Revise scope per Tim's note" : "Draft scope and submit to Tim" };
    case "Pending Tim Scope Approval":
      return { who: "Tim", what: "Approve scope or send back" };
    case "Proposal Sent":
      return { who: "Client", what: "Accept or decline proposal" };
    case "Accepted - Payment Pending":
      return r.engagementAgreementStatus === "Pending Signature"
        ? { who: "Client", what: "Sign engagement agreement" }
        : { who: "Client", what: "Pay via Stripe" };
    case "Accepted - Ready to Begin":
      if (r.engagementAgreementStatus === "Pending Signature") return { who: "Client", what: "Sign engagement agreement" };
      if (r.initialDocumentsRequired && !r.initialDocumentsReceived) return { who: "Staff", what: "Collect initial documents" };
      return { who: "System", what: "Open matter" };
    case "Proposal Declined":
      return { who: "—", what: "No follow-up" };
    case "Matter Active":
      return { who: "Staff", what: "Work the matter tasks" };
    case "Closed":
      return { who: "—", what: "" };
  }
}
