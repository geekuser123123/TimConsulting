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
| `EMAIL_FROM` (text) | `Tim Berry Consulting <consulting@mail.therothacademy.com>` (a domain verified in Resend) |
| `EMAIL_REPLY_TO` (text) | the inbox client replies should go to, e.g. Tim's Google Workspace address (the From address can't receive) |
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
the site. Those endpoints check their own secrets or signatures, so they can safely skip Access:

1. Cloudflare One (Zero Trust) → **Access controls → Applications → Create new application →
   Self-hosted and private**. (If asked, pick the free Zero Trust plan first.)
2. **Destinations:** use **+ Add public hostname**, not the Workers destination, because only
   hostnames take a path. Subdomain `tim-consulting`, domain `<you>.workers.dev` (or your custom
   domain), path `api/webhooks`.
3. **Access policies → Create new policy:** name `Public webhooks`, **Action: Bypass**,
   **Include: Everyone**. Save the policy, then save the application.

Leave the existing "tim-consulting - Cloudflare Workers" application as it is; it keeps the rest of
the site private.

Check it: opening `https://<site>/api/webhooks/tape` in a private browser window should show the
browser's "HTTP ERROR 405" page (the app only accepts POSTs there), not the Cloudflare Access
login page.

## 4. Domain
The Roth Academy site is `therothacademy.com` (WordPress). Its DNS is not in this Cloudflare
account, so the app runs on its `workers.dev` address until a custom domain is set up. Two options:

- **Own subdomain (`work.therothacademy.com`):** Workers custom domains need the domain's DNS
  on Cloudflare, so this requires moving `therothacademy.com`'s nameservers to Cloudflare (Domains →
  Add a domain; the WordPress site keeps working once its existing records are copied over). Then
  Worker → **Settings → Domains & Routes → Add → Custom domain** → `work.therothacademy.com`.
- **Keep `workers.dev`** and link **Roth Academy → Work With Tim** straight to
  `https://tim-consulting.<you>.workers.dev/work-with-tim`.

Either way, update `SITE_URL`, the Access bypass hostname, and re-run `npm run tape:webhook`.

(A path such as `therothacademy.com/work-with-tim` isn't practical: the app also needs `/admin`,
`/api`, `/_next` and `/brand`, which would clash with WordPress. A subdomain avoids that.)

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
