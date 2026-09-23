"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { US_STATES } from "@/lib/us-states";

type Errors = Record<string, string>;

function YesNo({ name, label, errors, onChange }: { name: string; label: string; errors: Errors; onChange?: (v: string) => void }) {
  return (
    <div className="field">
      <span className="label">{label}</span>
      <div className="radio-row" role="radiogroup" aria-label={label}>
        <label>
          <input type="radio" name={name} value="yes" required onChange={(e) => onChange?.(e.target.value)} /> Yes
        </label>
        <label>
          <input type="radio" name={name} value="no" required onChange={(e) => onChange?.(e.target.value)} /> No
        </label>
      </div>
      {errors[name] && <div className="error">{errors[name]}</div>}
    </div>
  );
}

function Text({
  name,
  label,
  hint,
  errors,
  required = true,
  multiline = false,
  type = "text",
  autoComplete,
}: {
  name: string;
  label: string;
  hint?: string;
  errors: Errors;
  required?: boolean;
  multiline?: boolean;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <div className="field">
      <label htmlFor={name}>
        {label}
        {!required && <span className="muted"> (optional)</span>}
        {hint && <span className="hint">{hint}</span>}
      </label>
      {multiline ? (
        <textarea id={name} name={name} required={required} maxLength={2000} aria-invalid={Boolean(errors[name])} />
      ) : (
        <input id={name} name={name} type={type} required={required} autoComplete={autoComplete} maxLength={300} aria-invalid={Boolean(errors[name])} />
      )}
      {errors[name] && <div className="error">{errors[name]}</div>}
    </div>
  );
}

export function RequestForm({ consent }: { consent: { recording: string; noRelationship: string } }) {
  const router = useRouter();
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [transaction, setTransaction] = useState<string>("");
  const [recording, setRecording] = useState<string>("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setErrors({});
    setFormError(null);
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(fd.entries()) as Record<string, unknown>;
    body.acknowledgeNoRelationship = fd.get("acknowledgeNoRelationship") === "on";
    try {
      const res = await fetch("/api/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) {
        router.push("/work-with-tim/request-received");
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { errors?: Errors; error?: string };
      if (data.errors) {
        setErrors(data.errors);
        setFormError("Please correct the highlighted fields.");
        const first = Object.keys(data.errors)[0];
        document.getElementById(first)?.focus();
      } else {
        setFormError(data.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate={false} className="card">
      <fieldset>
        <legend>About you</legend>
        <div className="grid-2">
          <Text name="firstName" label="First name" errors={errors} autoComplete="given-name" />
          <Text name="lastName" label="Last name" errors={errors} autoComplete="family-name" />
          <Text name="email" label="Email" type="email" errors={errors} autoComplete="email" />
          <Text name="phone" label="Phone" type="tel" errors={errors} autoComplete="tel" />
        </div>
        <div className="field">
          <label htmlFor="state">State of residence</label>
          <select id="state" name="state" required defaultValue="">
            <option value="" disabled>
              Select…
            </option>
            {US_STATES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          {errors.state && <div className="error">{errors.state}</div>}
        </div>
        <YesNo name="currentClient" label="Are you a current client?" errors={errors} />
        <YesNo name="academyClient" label="Are you an existing IRA Ideas / Tax Academy client?" errors={errors} />
      </fieldset>

      <fieldset>
        <legend>Your situation</legend>
        <Text name="mainReason" label="Main reason for requesting the call" multiline errors={errors} />
        <Text name="clientGoal" label="What are you trying to accomplish?" multiline errors={errors} />
        <Text name="clientQuestion" label="What are you currently unsure about?" multiline errors={errors} />
        <YesNo name="specificTransaction" label="Is there a specific transaction or decision involved?" errors={errors} onChange={setTransaction} />
        {transaction === "yes" && <Text name="transactionSummary" label="Short explanation of the transaction or decision" multiline errors={errors} />}
        <Text name="timingDeadline" label="Relevant deadline or timing" hint='For example "closing in 45 days" or "no deadline".' errors={errors} />
        <Text name="accountType" label="Account or plan type, if known" hint="For example Roth IRA, self-directed IRA, Solo 401(k). Do not include account numbers." required={false} errors={errors} />
        <Text name="relatedEntities" label="Related business/entity names, if relevant" required={false} multiline errors={errors} />
        <Text name="relatedParties" label="Other people or entities materially involved, if relevant" required={false} multiline errors={errors} />
        <Text name="heardAbout" label="How did you hear about Tim?" errors={errors} />
      </fieldset>

      <fieldset>
        <legend>Recording and acknowledgement</legend>
        <div className="field">
          <span className="label">Recording and transcription</span>
          <div className="check">
            <label>
              <input type="radio" name="recordingConsent" value="yes" required onChange={(e) => setRecording(e.target.value)} />
              <span>{consent.recording}</span>
            </label>
          </div>
          <div className="check">
            <label>
              <input type="radio" name="recordingConsent" value="no" required onChange={(e) => setRecording(e.target.value)} />
              <span>I do not consent to recording or transcription.</span>
            </label>
          </div>
          {recording === "no" && (
            <div className="notice info small">Understood. Your call will not be recorded. If Tim accepts your request, our team will contact you directly to arrange it.</div>
          )}
          {errors.recordingConsent && <div className="error">{errors.recordingConsent}</div>}
        </div>
        <div className="check">
          <label>
            <input type="checkbox" name="acknowledgeNoRelationship" required />
            <span>{consent.noRelationship}</span>
          </label>
          {errors.acknowledgeNoRelationship && <div className="error">{errors.acknowledgeNoRelationship}</div>}
        </div>
      </fieldset>

      {/* Honeypot for bots — hidden from people and screen readers */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-10000px" }}>
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {formError && <div className="notice bad">{formError}</div>}
      <div className="btn-row">
        <button className="btn btn-primary" type="submit" disabled={submitting}>
          {submitting ? "Submitting…" : "Submit Request"}
        </button>
      </div>
      <p className="muted small" style={{ marginTop: 12 }}>
        Submitting a request does not guarantee an appointment. Each request is reviewed before scheduling.
      </p>
    </form>
  );
}
