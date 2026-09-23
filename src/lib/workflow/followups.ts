import "server-only";
import { config } from "../config";
import { copy } from "../messages";
import { notifyStaff, safely, sendEmail, sendSms } from "../notify";
import { getStore } from "../store";
import { apply, firstName, formatWhen } from "./core";
import { reconcileAll } from "./reconcile";
import { scheduleLink } from "./review";
import { markCallCompleted } from "./transcript";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export interface SweepResult {
  reminders24h: number;
  reminders1h: number;
  callsCompleted: number;
  schedulingReminders: number;
  transcriptAlerts: number;
  proposalReminders: number;
  reconciled: number;
}

/**
 * Time-based follow-ups so nobody has to remember anything. Run every 5–15 minutes
 * (Vercel Cron / any scheduler → GET /api/cron/sweep with the CRON_SECRET).
 */
export async function runSweep(now = new Date()): Promise<SweepResult> {
  const store = getStore();
  const t = now.getTime();
  const res: SweepResult = { reminders24h: 0, reminders1h: 0, callsCompleted: 0, schedulingReminders: 0, transcriptAlerts: 0, proposalReminders: 0, reconciled: 0 };
  const minutes = config.scheduling.callDurationMinutes;

  const run = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      console.error(`[sweep] ${label}:`, e instanceof Error ? e.message : e);
    }
  };

  // Discovery call reminders + completion
  for (const r of await store.listRequests(["Discovery Scheduled"])) {
    if (!r.scheduledAt) continue;
    const start = Date.parse(r.scheduledAt);
    const when = formatWhen(r.scheduledAt);
    await run(`reminders ${r.id}`, async () => {
      if (!r.reminder24hSent && t >= start - DAY && t < start - 2 * HOUR) {
        await safely("24h email", () => sendEmail(r.email, copy.reminder.subject("tomorrow"), copy.reminder.body(firstName(r), when, r.meetingUrl, minutes)));
        await safely("24h sms", () => sendSms(r.phone, copy.reminder.sms(when, r.meetingUrl)));
        await apply(r, "system", "24-hour reminder sent", { reminder24hSent: true });
        res.reminders24h++;
      } else if (!r.reminder1hSent && t >= start - HOUR && t < start) {
        await safely("1h email", () => sendEmail(r.email, copy.reminder.subject("in 1 hour"), copy.reminder.body(firstName(r), when, r.meetingUrl, minutes)));
        await safely("1h sms", () => sendSms(r.phone, copy.reminder.sms(when, r.meetingUrl)));
        await apply(r, "system", "1-hour reminder sent", { reminder1hSent: true });
        res.reminders1h++;
      } else if (t > start + (minutes + 15) * 60 * 1000) {
        await markCallCompleted(r.id, "system");
        res.callsCompleted++;
      }
    });
  }

  // Approved but never booked → one reminder
  const schedDays = config.followUps.schedulingReminderDays;
  if (schedDays > 0) {
    for (const r of await store.listRequests(["Approved to Schedule"])) {
      if (!r.schedulingLinkSent || r.schedulingReminderSent || !r.schedulingLinkSentAt || r.alternativeHandling) continue;
      if (t - Date.parse(r.schedulingLinkSentAt) < schedDays * DAY) continue;
      await run(`scheduling reminder ${r.id}`, async () => {
        await safely("scheduling reminder", () => sendEmail(r.email, copy.schedulingReminder.subject, copy.schedulingReminder.body(firstName(r), scheduleLink(r))));
        await apply(r, "system", "Scheduling reminder sent", { schedulingReminderSent: true });
        res.schedulingReminders++;
      });
    }
  }

  // Call done but no transcript → alert staff once
  for (const r of await store.listRequests(["Discovery Completed"])) {
    if (!r.recordingConsent || r.transcriptReceived || r.transcriptOverdueNotified || !r.scheduledAt) continue;
    if (t - Date.parse(r.scheduledAt) < minutes * 60 * 1000 + config.transcripts.overdueHours * HOUR) continue;
    await run(`transcript alert ${r.id}`, async () => {
      await notifyStaff(`Transcript missing: ${r.clientName}`, `The discovery call with ${r.clientName} ended but no recording/transcript has arrived. Please check the recording provider, or upload the transcript manually.\n\n${config.siteUrl}/admin/staff/${r.id}`);
      await apply(r, "system", "Staff alerted: transcript overdue", { transcriptOverdueNotified: true });
      res.transcriptAlerts++;
    });
  }

  // Proposal not answered → one gentle reminder (none after a decline)
  const propDays = config.followUps.proposalReminderDays;
  if (propDays > 0) {
    for (const r of await store.listRequests(["Proposal Sent"])) {
      if (r.proposalReminderSent || !r.proposalSentDate || !r.proposalUrl) continue;
      if (t - Date.parse(r.proposalSentDate) < propDays * DAY) continue;
      await run(`proposal reminder ${r.id}`, async () => {
        await safely("proposal reminder", () => sendEmail(r.email, copy.proposalReminder.subject, copy.proposalReminder.body(firstName(r), r.proposalUrl!)));
        await apply(r, "system", "Proposal reminder sent", { proposalReminderSent: true });
        res.proposalReminders++;
      });
    }
  }

  // Safety net for missed Tape webhooks
  res.reconciled = await reconcileAll();
  return res;
}
