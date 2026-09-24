# Deploying to Vercel

## 1. Create the project
1. Sign in at https://vercel.com with the GitHub account that owns `geekuser123123/TimConsulting`.
2. **Add New… → Project → Import** the `TimConsulting` repository.
3. Framework preset: **Next.js** (auto-detected). Leave the build settings as they are.
4. Under **Settings → Git**, set the **Production Branch** to the branch you want to deploy
   (currently `claude/zen-clarke-ckfsrd`, or `main` after it's merged).

## 2. Environment variables (Settings → Environment Variables)

Minimum for a **private preview** (Tape connected, test calendar and test checkout):

| Name | Value |
|---|---|
| `PREVIEW_MODE` | `true` (shows a "Preview site" banner; allows the test calendar/checkout) |
| `SITE_URL` | your Vercel address, e.g. `https://tim-consulting.vercel.app` |
| `TOKEN_SECRET` | 40+ random characters |
| `SESSION_SECRET` | 40+ random characters (different) |
| `CRON_SECRET` | 40+ random characters (different) |
| `TIM_DASHBOARD_PASSWORD` / `STAFF_DASHBOARD_PASSWORD` | strong passwords |
| `CRM_DRIVER` | `tape` |
| `TAPE_API_KEY`, `TAPE_CONTACTS_APP_ID`, `TAPE_REQUESTS_APP_ID`, `TAPE_MATTERS_APP_ID`, `TAPE_WEBHOOK_SECRET` | from Tape (see TAPE_SETUP.md) |
| `EMAIL_DRIVER` | `resend` |
| `RESEND_API_KEY` | from resend.com |
| `EMAIL_FROM` | `onboarding@resend.dev` until your domain is verified |
| `TIM_NOTIFY_EMAIL`, `STAFF_NOTIFY_EMAILS` | real addresses |
| `SMS_DRIVER` | `off` (until Twilio is set up) |
| `SCHEDULING_DRIVER` | `mock` (until Calendly is set up) |

Generate random secrets in PowerShell:
```powershell
-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 40 | % {[char]$_})
```

The in-memory test CRM (`CRM_DRIVER=memory`) does **not** work on Vercel: serverless functions don't share memory, so data would disappear between page loads. Tape must be connected.

Resend without a verified domain can only deliver to your own Resend account email, so use that email address when you submit test requests.

## 3. Protect the preview
**Settings → Deployment Protection → Vercel Authentication** (or Password Protection on paid plans) so only your team can open it.

## 4. Deploy
Click **Deploy** (or push to the production branch). Then open `https://<your-app>.vercel.app/work-with-tim`.

## 5. Follow-up timer (reminders)
`vercel.json` runs `/api/cron/sweep` once a day, which is all the free (Hobby) plan allows. Reminders
(24h / 1h) need it every 10 minutes: either upgrade to Vercel Pro and change the schedule in
`vercel.json` to `*/10 * * * *`, or use a free external scheduler (e.g. cron-job.org or n8n) to call
`GET https://<your-app>/api/cron/sweep` with header `Authorization: Bearer <CRON_SECRET>` every 10 minutes.

## 6. Going live (later)
Remove `PREVIEW_MODE`, set `SCHEDULING_DRIVER=calendly` and the Stripe keys, turn off deployment
protection, add your domain under **Settings → Domains**, and complete LAUNCH_CHECKLIST.md.
