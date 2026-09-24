# Tim Berry Consulting System — V1

Consulting intake and engagement system built around one rule: **Tim only does attorney-level work.**

```
Client requests Tim → Tim accepts/declines → client schedules → discovery call recorded/transcribed
→ AI draft summary → staff drafts scope → Tim approves scope → client accepts/declines
→ signs engagement → pays if required → matter opens
```

Tape is the system of record: every step is written to **one Tim Consulting Request record** (fields + an audit trail). The website, Tape workflows, staff, transcription and Stripe handle everything else.

**Tim's whole job in the system is four clicks:** Accept or Decline a request, then Approve or send back a scope. He can click them in Tape or on `/admin/tim`.

## What's in the box

| Area | Where |
|---|---|
| Public pages | `/work-with-tim`, `/work-with-tim/request`, `/work-with-tim/request-received` |
| Private, token-gated pages | `/work-with-tim/schedule/[token]`, `/work-with-tim/proposal/[token]`, `/work-with-tim/accepted`, `/work-with-tim/payment-success` |
| Tim's two dashboards | `/admin/tim` (Requests Waiting for Tim · Scopes Waiting for Tim) |
| Staff console | `/admin/staff`, `/admin/staff/[id]` (full record: transcript, AI draft diagnosis, scope editor, conditions, audit trail) |
| Webhooks | `/api/webhooks/tape`, `/api/webhooks/calendly`, `/api/webhooks/zoom`, `/api/webhooks/transcript`, `/api/webhooks/stripe` |
| Scheduled follow-ups | `/api/cron/sweep` every 10 min (24h/1h reminders, call completion, missing-transcript alert, one scheduling reminder, one proposal reminder, Tape reconcile) |
| Workflow engine | `src/lib/workflow/*` (all status changes go through one guarded transition function) |
| Tape adapter + field map | `src/lib/store/tape.ts`, `src/lib/store/tape-schema.ts` |

## Run it locally (no accounts needed)

```bash
npm install
cp .env.example .env.local   # then set the dev values below
npm run dev
```

Minimal `.env.local` for local development:

```
CRM_DRIVER=memory
MEMORY_STORE_FILE=.data/dev-store.json
SCHEDULING_DRIVER=mock
EMAIL_DRIVER=console
SMS_DRIVER=console
TIM_DASHBOARD_PASSWORD=tim-dev
STAFF_DASHBOARD_PASSWORD=staff-dev
```

In this mode the CRM is in-memory, emails/texts print to the terminal (copy the private links from there), the scheduling page shows a built-in slot picker, and payments use a test checkout page on the site. Every one of these stand-ins is refused in production.

## Tests

```bash
npm test          # 35 tests, including all 20 V1 acceptance tests from the spec (tests/acceptance.test.ts)
npm run typecheck
npm run build
```

## Going live

1. Build the Tape apps, views and workflows in **[docs/TAPE_SETUP.md](docs/TAPE_SETUP.md)** (field list: [docs/TAPE_FIELDS.md](docs/TAPE_FIELDS.md)), then run `npm run tape:check` against the real workspace.
2. Connect Calendly, Zoom (or another recorder), Stripe, email and SMS: **[docs/INTEGRATIONS.md](docs/INTEGRATIONS.md)**.
3. Get Tim's sign-off on everything in **[docs/LAUNCH_CHECKLIST.md](docs/LAUNCH_CHECKLIST.md)**: consent wording, engagement agreement, retention, AI provider approval.
4. Deploy on Cloudflare: **[docs/DEPLOY_CLOUDFLARE.md](docs/DEPLOY_CLOUDFLARE.md)**. Private preview first, then go live.

The Tax Academy / client dashboard can reuse the same backend later: it calls the same `src/lib/workflow` functions, so there's no second system to build.
