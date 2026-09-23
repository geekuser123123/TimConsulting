# Tape Setup

Tape is the CRM of record. This system only uses Tape's **supported record API and webhooks**, never the beta Automation API. The workflows below are ordinary Tape workflows.

## 1. Apps

| App | Purpose |
|---|---|
| **Contacts** (existing) | One record per person. Matched by email, then phone, so returning clients are never duplicated. |
| **Tim Consulting Requests** (new) | One record per consulting matter/request. A returning client with a new issue gets a new request linked to the same contact. |
| **Matters** (existing or new) | Created only when every engagement condition is met; linked back to the request. |
| **Matter Tasks** (optional) | Staff and attorney tasks created when a matter opens. |

Create every field in **[TAPE_FIELDS.md](TAPE_FIELDS.md)** and set its **External ID** exactly as listed. The integration reads and writes by external ID, so labels can be renamed freely. `Status` is the single main pipeline field.

Then run:

```bash
TAPE_API_KEY=... TAPE_CONTACTS_APP_ID=... TAPE_REQUESTS_APP_ID=... TAPE_MATTERS_APP_ID=... npm run tape:check
```

This read-only check reports any missing field or category option.

## 2. Access and credentials

- Create a dedicated **integration user** and a **scoped personal access token** limited to these apps. Put it in `TAPE_API_KEY` on the server only.
- Limit who can see the Requests app. The transcript, recording links, diagnosis and audit trail are confidential. Fields marked "Visible to Tim: No" in TAPE_FIELDS.md can be hidden from Tim's views.
- Don't add fields for SSNs, passwords or full account numbers. The website form rejects them.

## 3. Tim's two views (the only things Tim needs)

**View: Requests Waiting for Tim**. Filter: `Status = Pending Tim Review`. Columns: Client Name · Client Goal · Client Question · Timing / Deadline · Current Client · Account Type · Transaction Summary · **Tim Decision** · Decline Reason.

Tim sets **Tim Decision = Accept** or **Decline** (Decline Reason is optional). That single change is the whole action.

**View: Scopes Waiting for Tim**. Filter: `Status = Pending Tim Scope Approval`. Columns: Client Name · Diagnosis: Primary Issue · Scope Draft / Proposed Work · Deliverables · Fee Amount · Exclusions · **Tim Approval** · Tim Scope Notes.

Tim sets **Tim Approval = Approved** or **Needs Changes** (the note is optional).

The same two dashboards also exist at `/admin/tim` with one-click buttons. Tim can use either one.

## 4. Workflows / webhooks

Create **one** Tape workflow on the Tim Consulting Requests app:

- **Trigger:** record updated (optionally only when `Tim Decision`, `Tim Approval`, `Scope Status` or `Initial Documents Received` change).
- **Action:** send webhook (HTTP POST) to
  `https://<your-site>/api/webhooks/tape?secret=<TAPE_WEBHOOK_SECRET>`
  with the record ID in the body (for example `{"record_id": "{{record_id}}"}`) or as `&record_id=` on the URL.

The server re-reads the record and acts on its **current state**, so duplicate or out-of-order webhooks are harmless:

| Change in Tape | System does |
|---|---|
| Tim Decision → Accept | Status → Approved to Schedule; creates the private single-use booking link; emails + texts it |
| Tim Decision → Decline | Status → Declined by Tim; sends the decline email; notifies staff; never sends scheduling access |
| Scope Status → Submitted to Tim | Validates the scope; Status → Pending Tim Scope Approval; notifies Tim |
| Tim Approval → Approved | Generates the private proposal link; Status → Proposal Sent; emails the client |
| Tim Approval → Needs Changes | Status → Scope Being Prepared; notifies staff with Tim's note |
| Initial Documents Received → Yes | Opens the matter if every other condition is met |

As a safety net, the 10-minute cron sweep also reconciles any request whose webhook was missed.

Optional native Tape notifications (for example "notify Tim when a record enters Pending Tim Review") are fine to add. The server already emails Tim and staff at those points.

## 5. Automation map (spec §24)

| Trigger | Handled by |
|---|---|
| New request → notify Tim/staff | Website → `submitRequest` |
| Tim accepts → send scheduling link | Tape webhook / dashboard → `acceptRequest` |
| Tim declines → send decline message | Tape webhook / dashboard → `declineRequest` |
| Appointment booked → update status and appointment fields | Calendly webhook → `handleBookingEvent` |
| Call completed → wait for transcript | Cron sweep (or staff) → `markCallCompleted` |
| Transcript received → structured summary + notify staff | Zoom / transcript webhook → `receiveTranscript` |
| Scope draft completed → notify Tim | Staff console / Tape → `submitScopeToTim` |
| Tim approves scope → generate/send proposal | Tape webhook / dashboard → `approveScope` |
| Client accepts → determine whether payment is required | Proposal page → `acceptProposal` |
| Payment required → create/send Stripe payment link | `getPaymentUrl` (Stripe Checkout tied to the request) |
| Stripe confirms payment → update Tape | Stripe webhook → `recordPayment` |
| All engagement conditions satisfied → open matter + tasks | `tryOpenMatter` (runs after every relevant event) |

## 6. Verifying the API adapter

Tape's developer docs could not be reached from the build environment. The adapter in `src/lib/store/tape.ts` is written against Tape's documented record endpoints (`POST /v1/record/app/{app_id}`, `GET`/`PUT /v1/record/{record_id}`, `GET /v1/app/{app_id}`), but three details **must be confirmed against the live API before launch**:

1. **Auth header**: `TAPE_AUTH_SCHEME=bearer` or `basic`.
2. **Record filtering**: `TapeClient.filterRecords` assumes `POST /v1/record/app/{app_id}/filter` with `{filters: [{field_id, type, match_type: "equal", values}]}` and a cursor. If Tape's filter shape differs, only that one method changes.
3. **Value formats**: `encodeValue`/`decodeValue` (email/phone arrays, category by option text, dates as `{start: "YYYY-MM-DD HH:mm:ss"}` UTC, relations as record-ID arrays).

To test: create one request through the site with `CRM_DRIVER=tape`, check the record in Tape, then accept it from `/admin/tim` and confirm the fields update.
