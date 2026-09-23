import { z } from "zod";

/** Fields where free text is entered and must be screened for sensitive identifiers. */
export const FREE_TEXT_FIELDS = [
  "mainReason",
  "clientGoal",
  "clientQuestion",
  "transactionSummary",
  "timingDeadline",
  "accountType",
  "relatedEntities",
  "relatedParties",
  "heardAbout",
] as const;

function luhn(digits: string): boolean {
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

/**
 * Returns a reason if the text looks like it contains a sensitive identifier we must not
 * store in Tape (SSN, card number, full account number, password).
 */
export function detectSensitive(text: string): string | null {
  if (/\b\d{3}[- ]\d{2}[- ]\d{4}\b/.test(text)) return "a Social Security number";
  if (/\b(ssn|social security)\b[^\n]{0,20}\d{9}\b/i.test(text)) return "a Social Security number";
  if (/\b(password|passcode|pwd)\s*[:=]/i.test(text)) return "a password";
  for (const m of text.matchAll(/\b(?:\d[ -]?){13,19}\b/g)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length >= 13 && luhn(digits)) return "a card number";
  }
  // 9+ consecutive digits is almost always an SSN or a full account number in this context.
  if (/\d{9,}/.test(text.replace(/[ -]/g, ""))) return "a full account or identification number";
  return null;
}

const yesNo = z.enum(["yes", "no"], { message: "Please choose Yes or No" });
const req = (label: string, max = 2000) => z.string().trim().min(1, `${label} is required`).max(max, `${label} is too long`);
const opt = (max = 2000) => z.string().trim().max(max).optional().default("");

export const intakeSchema = z
  .object({
    firstName: req("First name", 100),
    lastName: req("Last name", 100),
    email: z.string().trim().email("Enter a valid email address").max(254),
    phone: z
      .string()
      .trim()
      .refine((p) => p.replace(/\D/g, "").length >= 10 && p.replace(/\D/g, "").length <= 15, "Enter a valid phone number"),
    state: req("State of residence", 50),
    currentClient: yesNo,
    academyClient: yesNo,
    mainReason: req("Main reason for requesting the call"),
    clientGoal: req("What you are trying to accomplish"),
    clientQuestion: req("What you are currently unsure about"),
    specificTransaction: yesNo,
    transactionSummary: opt(),
    timingDeadline: req("Relevant deadline or timing", 500),
    accountType: opt(300),
    relatedEntities: opt(),
    relatedParties: opt(),
    heardAbout: req("How you heard about Tim", 300),
    recordingConsent: yesNo,
    acknowledgeNoRelationship: z.literal(true, { message: "Please confirm you understand this acknowledgement" }),
    website: z.string().max(0).optional().default(""), // honeypot
  })
  .superRefine((v, ctx) => {
    if (v.specificTransaction === "yes" && !v.transactionSummary) {
      ctx.addIssue({ code: "custom", path: ["transactionSummary"], message: "Please briefly explain the transaction or decision" });
    }
    for (const f of FREE_TEXT_FIELDS) {
      const found = detectSensitive(String(v[f] ?? ""));
      if (found) {
        ctx.addIssue({
          code: "custom",
          path: [f],
          message: `This looks like it contains ${found}. Please remove it — we never need that in this form.`,
        });
      }
    }
  });

export type IntakeInput = z.input<typeof intakeSchema>;
export type IntakeData = z.output<typeof intakeSchema>;
