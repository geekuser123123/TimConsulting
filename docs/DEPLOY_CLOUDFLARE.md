# Deploying to Cloudflare (Workers)

The app runs on Cloudflare Workers through the OpenNext adapter (`@opennextjs/cloudflare`).
Config: `wrangler.jsonc`, `open-next.config.ts`, and `cloudflare-worker.js` (which adds the
10-minute Cron Trigger for reminders and follow-ups, free on Cloudflare).

## 1. Create the Worker from GitHub
1. Cloudflare dashboard → **Workers & Pages → Create → Import a repository**.
2. Connect GitHub and pick **geekuser123123/TimConsulting**.
3. Settings:
   - **Project name:** `tim-consulting` (must match `name` in `wrangler.jsonc`)
   - **Production branch:** `claude/zen-clarke-ckfsrd` (or `main` after merging)
   - **Build command:** `npx opennextjs-cloudflare build`
   - **Deploy command:** `npx opennextjs-cloudflare deploy`
4. Deploy. Every push to the branch redeploys automatically.

Always deploy through this GitHub connection, not from a laptop. A local build would pick up
your `.env.local` test settings.

## 2. Settings (Worker → Settings → Variables and Secrets)

`wrangler.jsonc` already sets the non-secret defaults for a private preview:
`CRM_DRIVER=tape`, `EMAIL_DRIVER=resend`, `SMS_DRIVER=off`, `SCHEDULING_DRIVER=mock`, `PREVIEW_MODE=true`.

Add these as **Secret** (encrypted) unless noted:

| Name | Value |
|---|---|
| `SITE_URL` (text) | the Worker's address, e.g. `https://tim-consulting.<you>.workers.dev`, later your custom domain |
| `TOKEN_SECRET`, `SESSION_SECRET`, `CRON_SECRET` | a different 40+ character random string each |
| `TIM_DASHBOARD_PASSWORD`, `STAFF_DASHBOARD_PASSWORD` | strong passwords, at least 12 characters (shorter ones are refused on the hosted site) |
| `TAPE_API_KEY` | from Tape |
| `TAPE_CONTACTS_APP_ID`, `TAPE_REQUESTS_APP_ID`, `TAPE_MATTERS_APP_ID` (text) | Tape app IDs |
| `TAPE_WEBHOOK_SECRET` | random string; `npm run tape:webhook` puts it in the Tape webhook URL |
| `RESEND_API_KEY` | from resend.com |
| `EMAIL_FROM` (text) | `onboarding@resend.dev` until your domain is verified in Resend |
| `TIM_NOTIFY_EMAIL`, `STAFF_NOTIFY_EMAILS` (text) | real addresses |

Random string in PowerShell:
```powershell
-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 40 | % {[char]$_})
```

The in-memory test CRM does not work on Workers (no shared memory between requests), so Tape must be connected.

## 3. Keep the preview private
Cloudflare **Zero Trust → Access → Applications → Add an application (Self-hosted)** for the
Worker's hostname, allowing only your team's email addresses (free for up to 50 users).

### Let webhooks through
Access blocks everything by default, including the calls Tape, Stripe, Calendly and Zoom make to
the site. Those endpoints check their own secrets or signatures, so they can safely skip Access. In
the Access application, add a second **public hostname** for the same domain with path `api/webhooks`
(Cloudflare matches everything under it) and give it a policy with **Action: Bypass** and
**Include: Everyone**. Do the same for `api/cron` if you ever call the sweep from outside Cloudflare
(the built-in Cron Trigger doesn't need it).

Check it: opening `https://<site>/api/webhooks/tape` in a private browser window should show
`{"error":"Unauthorized"}` from the app, not the Cloudflare Access login page.

## 4. Domain
Because rothacademy.com is on Cloudflare, give the app its own subdomain:
Worker → **Settings → Domains & Routes → Add → Custom domain**, e.g. `work.rothacademy.com`.
Then link **Roth Academy → Work With Tim** to `https://work.rothacademy.com/work-with-tim` and
update `SITE_URL`.

(A path route such as `rothacademy.com/work-with-tim*` is possible, but the app also needs
`/admin`, `/api`, `/_next` and `/brand` paths, which would clash with the main site. A subdomain
avoids that.)

## 5. Reminders
The Cron Trigger in `wrangler.jsonc` calls the follow-up sweep every 10 minutes. Nothing else to set
up. Check it under Worker → **Settings → Triggers** and in the Worker's logs.

## 6. Going live
Remove `PREVIEW_MODE` (or set it to `false`), set `SCHEDULING_DRIVER=calendly` with the Calendly
secrets, add the Stripe secrets, turn `SMS_DRIVER` to `twilio` when ready, remove the Access
protection, and finish LAUNCH_CHECKLIST.md. Webhook URLs for Stripe/Calendly/Zoom/Tape use your
`SITE_URL` (see INTEGRATIONS.md).

## Local check (optional, Mac/Linux/WSL)
`npm run cf:preview` builds and runs the Worker locally with `.dev.vars` for settings. On
Windows, keep using `npm run dev`; Cloudflare does the real build.
