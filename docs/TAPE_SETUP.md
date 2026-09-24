# Tape Setup

Tape is the CRM of record. This system uses only Tape's **supported REST API** (apps, records, webhooks), never the beta Automation API. Setup takes about five minutes: create a token, run one command, check it, and later register the webhook.

## 1. Create an access token

In Tape: click your **avatar → Preferences → Developer → Personal access tokens → Create token**.

- **Capabilities:** `apps:read`, `apps:edit`, `records:read`, `records:edit`, `webhooks:manage`, `workspaces:read`.
- **Content:** the workspace the consulting apps will live in (or all content).
- Copy the token (it starts with `tape_pat_`). Tape shows it only once.

Ideally create it while signed in as a dedicated integration user, so the system's edits show under that name in Tape's history.

Put it in `.env.local` on your computer (never in chat, email or the repo):

```
TAPE_API_KEY=tape_pat_...
```

## 2. Create the apps: `npm run tape:setup`

From the project folder (PowerShell is fine):

```powershell
npm run tape:setup
```

This builds everything in Tape for you:

| App | What setup does |
|---|---|
| **Contacts** | Reuses an existing app named "Contacts" and adds only missing fields (First Name, Last Name, Email, Phone, State, Current Client). Otherwise creates it. |
| **Tim Consulting Requests** | Creates the app with every field in [TAPE_FIELDS.md](TAPE_FIELDS.md), including the 13 pipeline statuses. |
| **Matters** | Created, linked to Contacts and Requests. |
| **Matter Tasks** | Created, linked to Matters and Requests. Skip it with `npm run tape:setup -- --no-tasks`. |

If you have more than one workspace, it lists them. Pick one with `npm run tape:setup -- --workspace "Workspace name"`. To use apps you already have, put their IDs in `.env.local` (`TAPE_CONTACTS_APP_ID=…` etc.) before running.

Setup saves the app IDs into `.env.local` and prints them. **Add the same values in Cloudflare** (Workers & Pages → tim-consulting → Settings → Variables and Secrets): `TAPE_API_KEY` (as a secret), `TAPE_CONTACTS_APP_ID`, `TAPE_REQUESTS_APP_ID`, `TAPE_MATTERS_APP_ID`, `TAPE_TASKS_APP_ID`, and `TAPE_WEBHOOK_SECRET` (any long random string).

It is safe to run again at any time. It never deletes fields or data; it only adds what's missing.

**Field names matter; external IDs don't.** The system finds each field by its label (for example "Tim Decision"). You can rearrange fields, hide them, or add your own. Don't rename the listed labels unless you rename them in `src/lib/store/tape-schema.ts` too. If a label is ever renamed by mistake, `npm run tape:check` names it.

## 3. Check it: `npm run tape:check -- --smoke`

```powershell
npm run tape:check -- --smoke
```

This confirms every field and dropdown option is present. With `--smoke` it also creates one test contact and one test request, reads them back, filters, updates, and then deletes them. The expected result is `✅ Write, read, filter and update all work.`

## 4. Access

- Limit who can see the Requests app. The transcript, recording links, diagnosis and audit trail are confidential. Fields marked "Visible to Tim: No" in TAPE_FIELDS.md can be hidden from Tim's views.
- Don't add fields for SSNs, passwords or full account numbers. The website form rejects them.

## 5. Tim's two views (the only things Tim needs)

**View: Requests Waiting for Tim**. Filter: `Status = Pending Tim Review`. Columns: Client Name · Client Goal · Client Question · Timing / Deadline · Current Client · Account Type · Transaction Summary · **Tim Decision** · Decline Reason.

Tim sets **Tim Decision = Accept** or **Decline** (Decline Reason is optional). That single change is the whole action.

**View: Scopes Waiting for Tim**. Filter: `Status = Pending Tim Scope Approval`. Columns: Client Name · Diagnosis: Primary Issue · Scope Draft / Proposed Work · Deliverables · Fee Amount · Exclusions · **Tim Approval** · Tim Scope Notes.

Tim sets **Tim Approval = Approved** or **Needs Changes** (the note is optional).

The same two dashboards also exist at `/admin/tim` with one-click buttons. Tim can use either one.

## 6. Webhook: Tape → site

When Tim changes **Tim Decision** or **Tim Approval** in Tape, Tape tells the site right away through a webhook. Register it once the site is live on Cloudflare and has the Tape variables above:

```powershell
# in .env.local: SITE_URL=https://<your live address>  and  TAPE_WEBHOOK_SECRET=<same value as in Cloudflare>
npm run tape:setup -- --webhook
```

Setup creates a `record.update` webhook on the Requests app pointing at `https://<site>/api/webhooks/tape?secret=…` and asks Tape to verify it. Tape calls the site with a code, the site confirms it automatically, and setup reports `✅ Webhook verified and active.`

If it says the webhook is not active, check that:
- the site is deployed with `TAPE_API_KEY` and `TAPE_WEBHOOK_SECRET` set, and
- Cloudflare Access isn't blocking `/api/*` (see DEPLOY_CLOUDFLARE.md → "Let webhooks through").

Then run it again. You don't need a Tape workflow or n8n for this.

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

## 7. Automation map (spec §24)

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

## 8. How the connection works (for developers)

- `src/lib/store/tape-core.ts` is the REST client (Bearer token, retries on 429), the field matcher and the value formats. Category values are written as option IDs; dates are written as UTC `YYYY-MM-DD HH:mm:ss` and read from `start_utc`; emails and phones are written as `[{type, email|phone}]`; relations as record IDs.
- `src/lib/store/tape.ts` (`TapeStore`) caches each app's field list for 5 minutes. If a field or option seems to be missing, it re-reads the app once before failing.
- Searches use `POST /v1/record/filter/app/{id}`. Contacts are matched by email (`fully_includes`), then phone (`ends_with` plus an exact digit comparison).
- Every write passes `hook=false`, so the system's own updates never fire its own webhook.
- `tests/fake-tape.ts` is a strict stand-in for Tape's API that the test suite runs the whole workflow against.
