export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Digits only, US numbers normalized to 10 digits so "+1 (555) 123-4567" matches "555-123-4567". */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

/** E.164 for SMS delivery. Assumes US numbers when no country code is given. */
export function toE164(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (phone.trim().startsWith("+") && digits.length >= 8) return `+${digits}`;
  return null;
}
