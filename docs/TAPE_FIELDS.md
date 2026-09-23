# Tape Field Reference

_Generated from `src/lib/store/tape-schema.ts` by `npm run tape:doc`. Do not edit by hand._

Set each field's **External ID** in Tape exactly as listed; the integration reads and writes fields by external ID.

## App: Tim Consulting Requests


### Pipeline

| Field label | External ID | Type | Options | Visible to Tim |
|---|---|---|---|---|
| Status | `status` | Single category | Pending Tim Review · Declined by Tim · Approved to Schedule · Discovery Scheduled · Discovery Completed · Scope Being Prepared · Pending Tim Scope Approval · Proposal Sent · Accepted - Payment Pending · Accepted - Ready to Begin · Proposal Declined · Matter Active · Closed | Yes |

### Client

| Field label | External ID | Type | Options | Visible to Tim |
|---|---|---|---|---|
| Linked Contact | `contact` | Relation |  | Yes |
| Client Name | `client_name` | Single-line text |  | Yes |
| Current Client | `current_client` | Single category (Yes / No) |  | Yes |
| IRA Ideas / Tax Academy Client | `academy_client` | Single category (Yes / No) |  | Yes |
| Email | `email` | Email |  | Yes |
| Phone | `phone` | Phone |  | Yes |
| State | `state` | Single-line text |  | Yes |

### Request

| Field label | External ID | Type | Options | Visible to Tim |
|---|---|---|---|---|
| Request Date | `request_date` | Date + time |  | Yes |
| Source | `source` | Single-line text |  | Yes |
| Main Reason for Call | `main_reason` | Multi-line text |  | Yes |
| Client Goal | `client_goal` | Multi-line text |  | Yes |
| Client Question | `client_question` | Multi-line text |  | Yes |
| Specific Transaction? | `specific_transaction` | Single category (Yes / No) |  | Yes |
| Transaction Summary | `transaction_summary` | Multi-line text |  | Yes |
| Timing / Deadline | `timing_deadline` | Single-line text |  | Yes |
| Account Type | `account_type` | Single-line text |  | Yes |
| Related Entities | `related_entities` | Multi-line text |  | Yes |
| Related Parties | `related_parties` | Multi-line text |  | Yes |
| How Did You Hear About Tim | `heard_about` | Single-line text |  | Yes |

### Tim Review

| Field label | External ID | Type | Options | Visible to Tim |
|---|---|---|---|---|
| Tim Decision | `tim_decision` | Single category | Pending · Accept · Decline | Yes |
| Decision Date | `decision_date` | Date + time |  | Yes |
| Decline Reason | `decline_reason` | Single category | Not attorney-level work · Better handled by education/team · Outside scope · Insufficient information · Conflict issue · Capacity · Other | Yes |
| Internal Comments | `internal_comments` | Multi-line text |  | Yes |

### Scheduling

| Field label | External ID | Type | Options | Visible to Tim |
|---|---|---|---|---|
| Approved to Schedule | `approved_to_schedule` | Single category (Yes / No) |  | Yes |
| Scheduling Link Sent | `scheduling_link_sent` | Single category (Yes / No) |  | Yes |
| Scheduling Link Sent At | `scheduling_link_sent_at` | Date + time |  | No |
| Private Scheduling Link (provider) | `scheduling_provider_url` | Single-line text |  | No |

### System

| Field label | External ID | Type | Options | Visible to Tim |
|---|---|---|---|---|
| Schedule Token Nonce | `schedule_nonce` | Single-line text |  | No |

### Scheduling

| Field label | External ID | Type | Options | Visible to Tim |
|---|---|---|---|---|
| Scheduled Date/Time | `scheduled_at` | Date + time |  | Yes |
| Meeting URL | `meeting_url` | Single-line text |  | Yes |
| Calendar Event ID | `calendar_event_id` | Single-line text |  | Yes |
| Call Completed | `call_completed` | Single category (Yes / No) |  | Yes |

### System

| Field label | External ID | Type | Options | Visible to Tim |
|---|---|---|---|---|
| 24h Reminder Sent | `reminder_24h_sent` | Single category (Yes / No) |  | No |
| 1h Reminder Sent | `reminder_1h_sent` | Single category (Yes / No) |  | No |
| Scheduling Reminder Sent | `scheduling_reminder_sent` | Single category (Yes / No) |  | No |

### Recording

| Field label | External ID | Type | Options | Visible to Tim |
|---|---|---|---|---|
| Recording Consent | `recording_consent` | Single category (Yes / No) |  | Yes |
| Acknowledged No Attorney-Client Relationship | `ack_no_relationship` | Single category (Yes / No) |  | Yes |
| Alternative Handling (No Recording) | `alternative_handling` | Single category (Yes / No) |  | Yes |
| Recording URL | `recording_url` | Single-line text |  | Yes |
| Transcript URL/File | `transcript_url` | Single-line text |  | Yes |
| Transcript | `transcript_text` | Multi-line text |  | No |
| Transcript Received | `transcript_received` | Single category (Yes / No) |  | Yes |

### System

| Field label | External ID | Type | Options | Visible to Tim |
|---|---|---|---|---|
| Transcript Overdue Notified | `transcript_overdue_notified` | Single category (Yes / No) |  | No |

### Diagnosis

| Field label | External ID | Type | Options | Visible to Tim |
|---|---|---|---|---|
| Diagnosis: Client Goal | `diag_client_goal` | Multi-line text |  | Yes |
| Diagnosis: Current Situation | `diag_current_situation` | Multi-line text |  | Yes |
| Diagnosis: Key Facts | `diag_key_facts` | Multi-line text |  | Yes |
| Diagnosis: Primary Issue | `diag_primary_issue` | Multi-line text |  | Yes |
| Diagnosis: Secondary Issues | `diag_secondary_issues` | Multi-line text |  | Yes |
| Diagnosis: Facts Still Needed | `diag_facts_needed` | Multi-line text |  | Yes |
| Diagnosis: Attorney Work Required? | `diag_attorney_work` | Single category | Yes · No · Unclear | Yes |
| Diagnosis: Recommended Next Step | `diag_next_step` | Multi-line text |  | Yes |
| Diagnosis: Recommended Deliverable | `diag_deliverable` | Multi-line text |  | Yes |
| Diagnosis: Documents Needed | `diag_documents_needed` | Multi-line text |  | Yes |
| AI Draft Summary Generated At | `summary_generated_at` | Date + time |  | No |

### Scope

| Field label | External ID | Type | Options | Visible to Tim |
|---|---|---|---|---|
| Scope Status | `scope_status` | Single category | Not Started · Drafting · Submitted to Tim · Needs Changes · Approved | Yes |
| Scope: Your Situation (client-facing) | `scope_situation` | Multi-line text |  | Yes |
| Scope Draft / Proposed Work | `scope_draft` | Multi-line text |  | Yes |
| Deliverables | `deliverables` | Multi-line text |  | Yes |
| Exclusions | `exclusions` | Multi-line text |  | Yes |
| Client Responsibilities / Documents | `client_responsibilities` | Multi-line text |  | Yes |
| Additional Services (separate engagement) | `additional_services` | Multi-line text |  | Yes |
| Fee Type | `fee_type` | Single category | Fixed Fee · Hourly · Retainer · No Charge | Yes |
| Fee Amount | `fee_amount` | Number |  | Yes |
| Payment Required? | `payment_required` | Single category (Yes / No) |  | Yes |
| Tim Approval | `tim_approval` | Single category | Pending · Approved · Needs Changes | Yes |
| Tim Scope Notes | `tim_scope_notes` | Multi-line text |  | Yes |
| Scope Approved At | `scope_approved_at` | Date + time |  | Yes |

### System

| Field label | External ID | Type | Options | Visible to Tim |
|---|---|---|---|---|
| Proposal Token Nonce | `proposal_nonce` | Single-line text |  | No |

### Proposal

| Field label | External ID | Type | Options | Visible to Tim |
|---|---|---|---|---|
| Proposal URL | `proposal_url` | Single-line text |  | Yes |
| Proposal Sent Date | `proposal_sent_date` | Date + time |  | Yes |

### System

| Field label | External ID | Type | Options | Visible to Tim |
|---|---|---|---|---|
| Proposal Reminder Sent | `proposal_reminder_sent` | Single category (Yes / No) |  | No |

### Proposal

| Field label | External ID | Type | Options | Visible to Tim |
|---|---|---|---|---|
| Client Decision | `client_decision` | Single category | Pending · Accepted · Declined | Yes |
| Accepted Date | `accepted_date` | Date + time |  | Yes |
| Declined Date | `declined_date` | Date + time |  | Yes |
| Client Decline Reason | `client_decline_reason` | Single category | Price · Timing · Decided not to proceed · Using another professional · Scope did not match needs · Other | Yes |
| Client Decline Comment | `client_decline_comment` | Multi-line text |  | Yes |

### Engagement

| Field label | External ID | Type | Options | Visible to Tim |
|---|---|---|---|---|
| Engagement Agreement | `engagement_agreement_status` | Single category | Not Required · Pending Signature · Signed | Yes |
| Signed Name | `engagement_signed_name` | Single-line text |  | Yes |
| Signed At | `engagement_signed_at` | Date + time |  | Yes |
| Signed From IP | `engagement_signed_ip` | Single-line text |  | No |

### Stripe

| Field label | External ID | Type | Options | Visible to Tim |
|---|---|---|---|---|
| Stripe Customer ID | `stripe_customer_id` | Single-line text |  | Yes |
| Stripe Invoice / Checkout ID | `stripe_checkout_id` | Single-line text |  | Yes |
| Stripe Payment URL | `stripe_payment_url` | Single-line text |  | Yes |
| Stripe Payment URL Expires | `stripe_payment_url_expires` | Date + time |  | No |
| Payment Status | `payment_status` | Single category | Not Required · Unpaid · Paid · Refunded | Yes |
| Amount Paid | `amount_paid` | Number |  | Yes |
| Payment Date | `payment_date` | Date + time |  | Yes |
| Stripe Payment ID | `stripe_payment_id` | Single-line text |  | Yes |

### Matter

| Field label | External ID | Type | Options | Visible to Tim |
|---|---|---|---|---|
| Initial Documents Required Before Opening? | `initial_docs_required` | Single category (Yes / No) |  | Yes |
| Initial Documents Received | `initial_docs_received` | Single category (Yes / No) |  | Yes |
| Engagement Complete? | `engagement_complete` | Single category (Yes / No) |  | Yes |
| Matter Opened? | `matter_opened` | Single category (Yes / No) |  | Yes |
| Matter / Project ID | `matter_id` | Single-line text |  | Yes |
| Work Status | `work_status` | Single-line text |  | Yes |

### Audit

| Field label | External ID | Type | Options | Visible to Tim |
|---|---|---|---|---|
| Audit Trail | `audit_trail` | Multi-line text |  | No |

## App: Contacts (existing app — add any missing fields)

| Field label | External ID | Type | Options |
|---|---|---|---|
| First Name | `first_name` | Single-line text |  |
| Last Name | `last_name` | Single-line text |  |
| Email | `email` | Email |  |
| Phone | `phone` | Phone |  |
| State | `state` | Single-line text |  |
| Current Client | `current_client` | Single category (Yes / No) |  |

## App: Matters

| Field label | External ID | Type | Options |
|---|---|---|---|
| Matter Title | `title` | Single-line text |  |
| Client | `contact` | Relation |  |
| Consulting Request | `consulting_request` | Relation |  |
| Summary | `summary` | Multi-line text |  |
| Deliverables | `deliverables` | Multi-line text |  |

## App: Matter Tasks (optional)

| Field label | External ID | Type | Options |
|---|---|---|---|
| Task | `title` | Single-line text |  |
| Matter | `matter` | Relation |  |
| Consulting Request | `consulting_request` | Relation |  |
| Assigned To | `assignee` | Single category | staff · tim |
| Description | `description` | Multi-line text |  |

