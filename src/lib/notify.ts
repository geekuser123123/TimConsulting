/**
 * Outbound email + SMS. Drivers: console (dev), resend (email), twilio (SMS).
 *
 * Rule: never put transcripts, recordings, or diagnosis details in email/SMS. Internal
 * notifications link to the staff console; the record itself lives in Tape.
 */
import "server-only";
import { config } from "./config";
import { toE164 } from "./normalize";

export interface SentMessage {
  channel: "email" | "sms";
  to: string;
  subject?: string;
  body: string;
  at: string;
}

const g = globalThis as unknown as { __outbox?: SentMessage[] };
/** Every message sent in this process (used by tests and the dev console). */
export function outbox(): SentMessage[] {
  if (!g.__outbox) g.__outbox = [];
  return g.__outbox;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function textToHtml(text: string) {
  const linked = escapeHtml(text).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
  return `<div style="font-family:Georgia,serif;font-size:16px;line-height:1.5;color:#1f2937">${linked
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("")}</div>`;
}

export async function sendEmail(to: string | string[], subject: string, body: string): Promise<void> {
  const recipients = Array.isArray(to) ? to : [to];
  const at = new Date().toISOString();
  for (const r of recipients) outbox().push({ channel: "email", to: r, subject, body, at });

  if (config.email.driver === "console") {
    if (process.env.NODE_ENV !== "test" && !process.env.VITEST) console.info(`[email] to=${recipients.join(",")} subject="${subject}"\n${body}\n`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.email.resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: config.email.from,
      to: recipients,
      ...(config.email.replyTo ? { reply_to: config.email.replyTo } : {}),
      subject,
      text: body,
      html: textToHtml(body),
    }),
  });
  // Resend's error message (e.g. "domain is not verified") helps diagnose setup; it never echoes the email body.
  if (!res.ok) throw new Error(`Email send failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
}

export async function sendSms(to: string, body: string): Promise<void> {
  if (config.sms.driver === "off") return;
  const e164 = toE164(to);
  if (!e164) return;
  outbox().push({ channel: "sms", to: e164, body, at: new Date().toISOString() });

  if (config.sms.driver === "console") {
    if (process.env.NODE_ENV !== "test" && !process.env.VITEST) console.info(`[sms] to=${e164}\n${body}\n`);
    return;
  }
  const sid = config.sms.twilioAccountSid;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${config.sms.twilioAuthToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: e164, From: config.sms.twilioFrom, Body: body }),
  });
  if (!res.ok) throw new Error(`SMS send failed (${res.status})`);
}

/** Notifications must never break the workflow step that triggered them. */
export async function safely(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    console.error(`[notify] ${label} failed:`, e instanceof Error ? e.message : e);
  }
}

export const notifyTim = (subject: string, body: string) => safely("tim", () => sendEmail(config.email.timEmail, subject, body));
export const notifyStaff = (subject: string, body: string) => safely("staff", () => sendEmail(config.email.staffEmails, subject, body));
