# Integrations

All credentials are server-side environment variables (see `.env.example`). Nothing secret is sent to the browser.

## Scheduling: Calendly

1. Create **one** event type named **"Tim Berry Discovery Call - 15 Minutes"** and mark it **secret** so it isn't listed on Tim's public page. Set its location to Zoom so every booking gets a unique join URL.
2. Put its URI in `CALENDLY_DISCOVERY_EVENT_TYPE_URI` and a personal access token in `CALENDLY_API_TOKEN`.
3. Create a webhook subscription (organization scope) for `invitee.created` and `invitee.canceled` pointing to `https://<site>/api/webhooks/calendly` with a signing key, and set `CALENDLY_WEBHOOK_SIGNING_KEY`.

How "nobody can schedule Tim before Tim accepts" is enforced:

- No booking link exists until Tim accepts. Accepting creates a **single-use** Calendly scheduling link for that one event type.
- The client only ever gets our token-gated `/work-with-tim/schedule/[token]` URL. That page re-checks the request's status on every visit before showing the booking button.
- Every booking webhook is matched to an approved request (by the `utm_content` request ID we add to the link). A booking that doesn't match one is **cancelled automatically** through the Calendly API, and staff are alerted.

Confirmation plus the 24-hour and 1-hour reminders are sent by this system, so Calendly's own reminder emails can be turned off to avoid duplicates.

## Recording and transcription: Zoom (or any provider)

**Zoom:** create a Zoom webhook-only app. Subscribe it to `recording.transcript_completed` (and optionally `recording.completed`) at `https://<site>/api/webhooks/zoom`, enable "include download token", and set `ZOOM_WEBHOOK_SECRET_TOKEN`. Turn on cloud recording with audio transcript for Tim's account. Recordings are matched to the request by the meeting ID in the join URL saved at booking.

**Any other provider** (Fireflies, Otter, a vendor, Zapier/Make): POST JSON to `/api/webhooks/transcript` with header `X-Signature: sha256=<HMAC-SHA256(TRANSCRIPT_WEBHOOK_SECRET, body)>`:

```json
{ "calendarEventId": "...", "recordingUrl": "https://...", "transcriptUrl": "https://...", "transcriptText": "..." }
```

`requestId`, `calendarEventId`, `meetingUrl` or `meetingId` can identify the request.

**Manual fallback:** staff can upload or paste a transcript on the request page.

Rules the code enforces:

- A recording or transcript for a client who did **not** consent is rejected, and staff are alerted.
- Non-consenting clients never receive the automated (recorded) booking link. Staff get a task to arrange the call manually.
- Transcripts are never emailed. Notifications only link to the access-controlled record.
- If no transcript arrives within `TRANSCRIPT_OVERDUE_HOURS` after the call, staff get one alert.
- Recording and transcript URLs should be access-controlled at the provider, never public share links. Retention of raw audio and transcripts is configured at the provider and in Tape, per the policy Tim approves.

## AI draft summary

Off by default (`AI_SUMMARY_ENABLED=false`). When enabled, `src/lib/summary.ts` sends the intake answers and transcript to Claude and fills the **Diagnosis** fields with structured output: client goal, current situation, primary and secondary issues, relevant facts, facts/documents still needed, attorney work required (Yes/No/Unclear), recommended work, and recommended deliverable.

- It is labelled everywhere as an **internal draft, not attorney analysis**. Staff edit it on the request page.
- Enable it only once the account is approved for confidential client information, with a data-retention agreement appropriate for client data.
- If the model is unavailable or declines, the workflow continues and staff work from the transcript.

## Payments: Stripe

1. Set `STRIPE_SECRET_KEY`.
2. Add a webhook endpoint at `https://<site>/api/webhooks/stripe` for `checkout.session.completed` and `checkout.session.async_payment_succeeded`, then set `STRIPE_WEBHOOK_SECRET`.

Flow:

- When the client accepts (and signs, if required), a one-time **hosted Checkout** is created for the approved fee. The Tape request ID is stored in the session metadata, the PaymentIntent metadata and `client_reference_id`. The Stripe customer, checkout ID and payment URL are saved on the Tape record.
- Checkout links expire after 24 hours at most, so a fresh one is created automatically whenever the client returns to the proposal page after expiry.
- The webhook is **signature-verified**. It checks that the amount matches the approved fee, then sets Payment Status = Paid, Amount Paid, Payment Date and Stripe IDs, moves the status to Accepted - Ready to Begin, and opens the matter if every other condition is met. Nobody has to check Stripe by hand.
- An amount mismatch never opens a matter. It is flagged to staff instead.
- Engagements with no upfront payment skip Stripe entirely.

## Email and SMS

- Email: Resend (`EMAIL_DRIVER=resend`). To use another provider, change `sendEmail` in `src/lib/notify.ts`.
- SMS: Twilio (`SMS_DRIVER=twilio`). Used for the scheduling link and the call reminders.
- All client-facing copy lives in `src/lib/messages.ts` so Tim can review it in one place.

## Cron

`GET /api/cron/sweep` with `Authorization: Bearer <CRON_SECRET>` every 10 minutes. `vercel.json` already configures this for Vercel (Pro plan needed for sub-daily crons), or any external scheduler can call it.
