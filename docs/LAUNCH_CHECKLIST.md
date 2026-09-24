# Launch Checklist

## Needs Tim's approval (legal wording and policy)

- [ ] Recording/transcription consent wording: `consentText.recording` in `src/lib/messages.ts`
- [ ] "No attorney-client relationship" acknowledgement: `consentText.noRelationship`
- [ ] Verbal confirmation script at the start of each call: `consentText.verbalScript` (shown to staff on the request page)
- [ ] Engagement agreement text and signature requirements: `engagementAgreement` in `src/lib/messages.ts` (currently marked DRAFT on the page). Set `ENGAGEMENT_AGREEMENT_REQUIRED=false` if no agreement is needed.
- [ ] All client emails and texts in `src/lib/messages.ts` (decline message, scheduling, reminders, proposal, engagement active)
- [ ] Retention periods for raw audio and transcripts (configured at the recording provider and in Tape)
- [ ] AI summarization provider approved for confidential client information before setting `AI_SUMMARY_ENABLED=true`
- [ ] Whether initial documents must be received before a matter opens (`INITIAL_DOCUMENTS_REQUIRED_DEFAULT`; staff can override per request)

## Technical

- [ ] Tape apps built with `npm run tape:setup`; `npm run tape:check -- --smoke` passes
- [ ] Tape webhook verified (`npm run tape:setup -- --webhook`); accept/decline from inside Tape tested
- [ ] Calendly secret event type, token and webhook configured; test booking plus cancellation
- [ ] Zoom (or other) recording webhook configured; test transcript attaches to the right request
- [ ] Stripe live keys and webhook; one real low-value test payment made and refunded
- [ ] Email domain verified (SPF/DKIM) and Twilio number registered
- [ ] Strong random `TOKEN_SECRET`, `SESSION_SECRET`, `CRON_SECRET`, `TAPE_WEBHOOK_SECRET`, `TRANSCRIPT_WEBHOOK_SECRET`; strong dashboard passwords
- [ ] HTTPS only (HSTS is sent); `CRM_DRIVER=tape`
- [ ] Cron running every 10 minutes
- [ ] "Work With Tim" link added under Roth Academy navigation

## V1 acceptance tests (spec §28)

All 20 are automated in `tests/acceptance.test.ts` and run with `npm test`. Re-run them by hand once on the live stack (real Tape, Calendly, Stripe test mode) before announcing.

| # | Test | Covered by |
|---|---|---|
| 1 | Website request creates the correct Tape contact/request | `submitRequest` |
| 2 | Existing contacts are not duplicated | email-then-phone match in `findContact` |
| 3 | Nobody can schedule Tim before Tim accepts | no link before accept; gated token page; unapproved bookings auto-cancelled |
| 4 | Tim can accept in one action | dashboard button or Tape field |
| 5 | Tim can decline in one action | dashboard button or Tape field |
| 6 | Accepted clients automatically receive the correct scheduling link | email + SMS with private token link |
| 7 | Booking updates Tape automatically | Calendly webhook |
| 8 | Recording consent is captured | required choice + acknowledgement; non-consent routed to staff |
| 9 | Recording/transcript attaches to the correct request | event ID / meeting ID matching |
| 10 | Staff can draft scope without Tim recreating the conversation | transcript + AI draft diagnosis on the record |
| 11 | Tim can approve the scope in one action | dashboard button or Tape field |
| 12 | Client receives a secure proposal link | HMAC-signed, 256-bit nonce, noindex/no-referrer |
| 13 | Client can accept or decline | proposal page |
| 14 | Client who owes money gets the correct Stripe option | Checkout for the approved fee, tied to the request |
| 15 | Successful Stripe payment updates Tape automatically | verified webhook |
| 16 | No-payment engagements bypass Stripe | `paymentRequired = false` |
| 17 | Matter not opened until all conditions are complete | `engagementConditions` / `tryOpenMatter` |
| 18 | Every step visible from one Tape record | fields + audit trail on the request |
| 19 | Tim doesn't take notes | transcript + AI draft summary |
| 20 | Tim doesn't have to remember follow-ups | cron sweep reminders and alerts |
