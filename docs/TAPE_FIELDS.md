# Tape Field Reference

_Generated from `src/lib/store/tape-schema.ts` by `npm run tape:doc`. Do not edit by hand._

`npm run tape:setup` creates all of these fields for you (see TAPE_SETUP.md). The system finds each field by its **label**, so keep the labels as listed. Everything else (order, visibility, external IDs, extra fields of your own) can be changed freely in Tape.

## App: Tim Consulting Requests


### Pipeline

| Field label | Type | Options | Visible to Tim |
|---|---|---|---|
| Status | Single category | Pending Tim Review · Declined by Tim · Approved to Schedule · Discovery Scheduled · Discovery Completed · Scope Being Prepared · Pending Tim Scope Approval · Proposal Sent · Accepted - Payment Pending · Accepted - Ready to Begin · Proposal Declined · Matter Active · Closed | Yes |

### Client

| Field label | Type | Options | Visible to Tim |
|---|---|---|---|
| Linked Contact | Relation |  | Yes |
| Client Name | Single-line text |  | Yes |
| Current Client | Single category (Yes / No) |  | Yes |
| IRA Ideas / Tax Academy Client | Single category (Yes / No) |  | Yes |
| Email | Email |  | Yes |
| Phone | Phone |  | Yes |
| State | Single-line text |  | Yes |

### Request

| Field label | Type | Options | Visible to Tim |
|---|---|---|---|
| Request Date | Date + time |  | Yes |
| Source | Single-line text |  | Yes |
| Main Reason for Call | Multi-line text |  | Yes |
| Client Goal | Multi-line text |  | Yes |
| Client Question | Multi-line text |  | Yes |
| Specific Transaction? | Single category (Yes / No) |  | Yes |
| Transaction Summary | Multi-line text |  | Yes |
| Timing / Deadline | Single-line text |  | Yes |
| Account Type | Single-line text |  | Yes |
| Related Entities | Multi-line text |  | Yes |
| Related Parties | Multi-line text |  | Yes |
| How Did You Hear About Tim | Single-line text |  | Yes |

### Tim Review

| Field label | Type | Options | Visible to Tim |
|---|---|---|---|
| Tim Decision | Single category | Pending · Accept · Decline | Yes |
| Decision Date | Date + time |  | Yes |
| Decline Reason | Single category | Not attorney-level work · Better handled by education/team · Outside scope · Insufficient information · Conflict issue · Capacity · Other | Yes |
| Internal Comments | Multi-line text |  | Yes |

### Scheduling

| Field label | Type | Options | Visible to Tim |
|---|---|---|---|
| Approved to Schedule | Single category (Yes / No) |  | Yes |
| Scheduling Link Sent | Single category (Yes / No) |  | Yes |
| Scheduling Link Sent At | Date + time |  | No |
| Private Scheduling Link (provider) | Single-line text |  | No |

### System

| Field label | Type | Options | Visible to Tim |
|---|---|---|---|
| Schedule Token Nonce | Single-line text |  | No |

### Scheduling

| Field label | Type | Options | Visible to Tim |
|---|---|---|---|
| Scheduled Date/Time | Date + time |  | Yes |
| Meeting URL | Single-line text |  | Yes |
| Calendar Event ID | Single-line text |  | Yes |
| Call Completed | Single category (Yes / No) |  | Yes |

### System

| Field label | Type | Options | Visible to Tim |
|---|---|---|---|
| 24h Reminder Sent | Single category (Yes / No) |  | No |
| 1h Reminder Sent | Single category (Yes / No) |  | No |
| Scheduling Reminder Sent | Single category (Yes / No) |  | No |

### Recording

| Field label | Type | Options | Visible to Tim |
|---|---|---|---|
| Recording Consent | Single category (Yes / No) |  | Yes |
| Acknowledged No Attorney-Client Relationship | Single category (Yes / No) |  | Yes |
| Alternative Handling (No Recording) | Single category (Yes / No) |  | Yes |
| Recording URL | Single-line text |  | Yes |
| Transcript URL/File | Single-line text |  | Yes |
| Transcript | Multi-line text |  | No |
| Transcript Received | Single category (Yes / No) |  | Yes |

### System

| Field label | Type | Options | Visible to Tim |
|---|---|---|---|
| Transcript Overdue Notified | Single category (Yes / No) |  | No |

### Diagnosis

| Field label | Type | Options | Visible to Tim |
|---|---|---|---|
| Diagnosis: Client Goal | Multi-line text |  | Yes |
| Diagnosis: Current Situation | Multi-line text |  | Yes |
| Diagnosis: Key Facts | Multi-line text |  | Yes |
| Diagnosis: Primary Issue | Multi-line text |  | Yes |
| Diagnosis: Secondary Issues | Multi-line text |  | Yes |
| Diagnosis: Facts Still Needed | Multi-line text |  | Yes |
| Diagnosis: Attorney Work Required? | Single category | Yes · No · Unclear | Yes |
| Diagnosis: Recommended Next Step | Multi-line text |  | Yes |
| Diagnosis: Recommended Deliverable | Multi-line text |  | Yes |
| Diagnosis: Documents Needed | Multi-line text |  | Yes |
| AI Draft Summary Generated At | Date + time |  | No |

### Scope

| Field label | Type | Options | Visible to Tim |
|---|---|---|---|
| Scope Status | Single category | Not Started · Drafting · Submitted to Tim · Needs Changes · Approved | Yes |
| Scope: Your Situation (client-facing) | Multi-line text |  | Yes |
| Scope Draft / Proposed Work | Multi-line text |  | Yes |
| Deliverables | Multi-line text |  | Yes |
| Exclusions | Multi-line text |  | Yes |
| Client Responsibilities / Documents | Multi-line text |  | Yes |
| Additional Services (separate engagement) | Multi-line text |  | Yes |
| Fee Type | Single category | Fixed Fee · Hourly · Retainer · No Charge | Yes |
| Fee Amount | Number |  | Yes |
| Payment Required? | Single category (Yes / No) |  | Yes |
| Tim Approval | Single category | Pending · Approved · Needs Changes | Yes |
| Tim Scope Notes | Multi-line text |  | Yes |
| Scope Approved At | Date + time |  | Yes |

### System

| Field label | Type | Options | Visible to Tim |
|---|---|---|---|
| Proposal Token Nonce | Single-line text |  | No |

### Proposal

| Field label | Type | Options | Visible to Tim |
|---|---|---|---|
| Proposal URL | Single-line text |  | Yes |
| Proposal Sent Date | Date + time |  | Yes |

### System

| Field label | Type | Options | Visible to Tim |
|---|---|---|---|
| Proposal Reminder Sent | Single category (Yes / No) |  | No |

### Proposal

| Field label | Type | Options | Visible to Tim |
|---|---|---|---|
| Client Decision | Single category | Pending · Accepted · Declined | Yes |
| Accepted Date | Date + time |  | Yes |
| Declined Date | Date + time |  | Yes |
| Client Decline Reason | Single category | Price · Timing · Decided not to proceed · Using another professional · Scope did not match needs · Other | Yes |
| Client Decline Comment | Multi-line text |  | Yes |

### Engagement

| Field label | Type | Options | Visible to Tim |
|---|---|---|---|
| Engagement Agreement | Single category | Not Required · Pending Signature · Signed | Yes |
| Signed Name | Single-line text |  | Yes |
| Signed At | Date + time |  | Yes |
| Signed From IP | Single-line text |  | No |

### Stripe

| Field label | Type | Options | Visible to Tim |
|---|---|---|---|
| Stripe Customer ID | Single-line text |  | Yes |
| Stripe Invoice / Checkout ID | Single-line text |  | Yes |
| Stripe Payment URL | Single-line text |  | Yes |
| Stripe Payment URL Expires | Date + time |  | No |
| Payment Status | Single category | Not Required · Unpaid · Paid · Refunded | Yes |
| Amount Paid | Number |  | Yes |
| Payment Date | Date + time |  | Yes |
| Stripe Payment ID | Single-line text |  | Yes |

### Matter

| Field label | Type | Options | Visible to Tim |
|---|---|---|---|
| Initial Documents Required Before Opening? | Single category (Yes / No) |  | Yes |
| Initial Documents Received | Single category (Yes / No) |  | Yes |
| Engagement Complete? | Single category (Yes / No) |  | Yes |
| Matter Opened? | Single category (Yes / No) |  | Yes |
| Matter / Project ID | Single-line text |  | Yes |
| Work Status | Single-line text |  | Yes |

### Audit

| Field label | Type | Options | Visible to Tim |
|---|---|---|---|
| Audit Trail | Multi-line text |  | No |

## App: Contacts (an existing Contacts app is reused; setup adds any missing fields)

| Field label | Type | Options |
|---|---|---|
| First Name | Single-line text |  |
| Last Name | Single-line text |  |
| Email | Email |  |
| Phone | Phone |  |
| State | Single-line text |  |
| Current Client | Single category (Yes / No) |  |

## App: Matters

| Field label | Type | Options |
|---|---|---|
| Matter Title | Single-line text |  |
| Client | Relation |  |
| Consulting Request | Relation |  |
| Summary | Multi-line text |  |
| Deliverables | Multi-line text |  |

## App: Matter Tasks (optional)

| Field label | Type | Options |
|---|---|---|
| Task | Single-line text |  |
| Matter | Relation |  |
| Consulting Request | Relation |  |
| Assigned To | Single category | staff · tim |
| Description | Multi-line text |  |

