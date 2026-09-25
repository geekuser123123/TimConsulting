"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { US_STATES } from "@/lib/us-states";

type Errors = Record<string, string>;

export interface ConsentCopy {
  recordingTitle: string;
  recordingWhy: string;
  recordingPrivacy: string;
  recording: string;
  noRecordingPrompt: string;
  noRecordingOption: string;
  noRelationship: string;
  sensitiveWarning: string;
}

const HEARD_ABOUT = ["Roth Academy", "IRA Ideas", "Tax Academy", "Client referral", "Online search", "Event or webinar", "Other"];
const PLAN_TYPES = ["Self-directed IRA", "Roth IRA", "401(k) or solo 401(k)", "Other retirement plan", "Multiple account types", "Not sure"];
const STEP_LABELS = ["About you", "Your situation", "Review"];

/** Which step each server-side field lives on, so a server error sends the client back to the right step. */
const FIELD_STEP: Record<string, number> = {
  firstName: 0, lastName: 0, email: 0, phone: 0, state: 0, heardAbout: 0, currentClient: 0, academyClient: 0,
  mainReason: 1, clientGoal: 1, clientQuestion: 1, specificTransaction: 1, transactionSummary: 1, timingDeadline: 1,
  accountType: 1, relatedEntities: 1, relatedParties: 1,
  recordingConsent: 2, acknowledgeNoRelationship: 2,
};

function Err({ name, errors }: { name: string; errors: Errors }) {
  return errors[name] ? (
    <div className="error" id={`${name}-error`} role="alert">
      {errors[name]}
    </div>
  ) : null;
}

export function RequestForm({ consent }: { consent: ConsentCopy }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [transaction, setTransaction] = useState("");
  const [alternative, setAlternative] = useState(false);

  function scrollToCard() {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    cardRef.current?.scrollIntoView({ behavior: reduce ? "instant" : "smooth", block: "start" });
  }

  function go(to: number) {
    setStep(to);
    scrollToCard();
  }

  /** Native validation for the visible controls of the current step. */
  function validateStep(index: number): boolean {
    const panel = formRef.current?.querySelector<HTMLElement>(`[data-step="${index}"]`);
    if (!panel) return true;
    const controls = [...panel.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input,select,textarea")].filter(
      (el) => !el.closest("[hidden]") && el.name !== "website",
    );
    for (const c of controls) {
      if (!c.checkValidity()) {
        c.reportValidity();
        c.focus();
        return false;
      }
    }
    return true;
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validateStep(2)) return;
    setSubmitting(true);
    setErrors({});
    setFormError(null);
    const fd = new FormData(e.currentTarget);
    const get = (k: string) => String(fd.get(k) ?? "");
    const body = {
      firstName: get("firstName"),
      lastName: get("lastName"),
      email: get("email"),
      phone: get("phone"),
      state: get("state"),
      heardAbout: get("heardAbout"),
      currentClient: get("currentClient"),
      academyClient: get("academyClient"),
      mainReason: get("mainReason"),
      clientGoal: get("clientGoal"),
      clientQuestion: get("clientQuestion"),
      specificTransaction: get("specificTransaction"),
      transactionSummary: get("specificTransaction") === "yes" ? get("transactionSummary") : "",
      timingDeadline: get("timingDeadline"),
      accountType: get("accountType"),
      relatedEntities: get("relatedEntities"),
      relatedParties: get("relatedParties"),
      recordingConsent: alternative ? "no" : fd.get("recordingConsent") === "on" ? "yes" : "",
      acknowledgeNoRelationship: fd.get("acknowledgeNoRelationship") === "on",
      website: get("website"),
    };
    try {
      const res = await fetch("/api/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) {
        router.push(alternative ? "/work-with-tim/request-received?alt=1" : "/work-with-tim/request-received");
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { errors?: Errors; error?: string };
      if (data.errors) {
        setErrors(data.errors);
        const first = Object.keys(data.errors)[0];
        const target = FIELD_STEP[first] ?? 2;
        setFormError(target === step ? "Please correct the highlighted fields." : "Please correct the highlighted fields on this step.");
        setStep(target);
        setTimeout(() => {
          scrollToCard();
          document.getElementById(first)?.focus();
        }, 50);
      } else {
        setFormError(data.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setFormError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const invalid = (name: string) => (errors[name] ? { "aria-invalid": true, "aria-describedby": `${name}-error` } : {});

  return (
    <div className="form-card" ref={cardRef} style={{ scrollMarginTop: 24 }}>
      <h3>Tell us what is happening.</h3>
      <p className="subhead">Complete the three steps below. Fields marked * are required.</p>
      <ol className="steps" aria-label="Form progress">
        {STEP_LABELS.map((label, i) => (
          <li key={label} className={i === step ? "active" : i < step ? "done" : ""} aria-current={i === step ? "step" : undefined}>
            {i + 1} · {label}
          </li>
        ))}
      </ol>

      <form ref={formRef} onSubmit={onSubmit} noValidate>
        {/* Step 1 — About you */}
        <div className="form-step" data-step="0" hidden={step !== 0}>
          <h4>First, how can we reach you?</h4>
          <div className="field-grid">
            <label className="field">
              <span>First name *</span>
              <input id="firstName" name="firstName" autoComplete="given-name" required maxLength={80} {...invalid("firstName")} />
              <Err name="firstName" errors={errors} />
            </label>
            <label className="field">
              <span>Last name *</span>
              <input id="lastName" name="lastName" autoComplete="family-name" required maxLength={80} {...invalid("lastName")} />
              <Err name="lastName" errors={errors} />
            </label>
            <label className="field">
              <span>Email address *</span>
              <input id="email" name="email" type="email" autoComplete="email" required maxLength={254} {...invalid("email")} />
              <Err name="email" errors={errors} />
            </label>
            <label className="field">
              <span>Phone number *</span>
              <input id="phone" name="phone" type="tel" autoComplete="tel" required maxLength={35} {...invalid("phone")} />
              <Err name="phone" errors={errors} />
            </label>
            <label className="field">
              <span>State of residence *</span>
              <select id="state" name="state" required defaultValue="" {...invalid("state")}>
                <option value="">Select your state</option>
                {US_STATES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <Err name="state" errors={errors} />
            </label>
            <label className="field">
              <span>How did you hear about Tim? *</span>
              <select id="heardAbout" name="heardAbout" required defaultValue="" {...invalid("heardAbout")}>
                <option value="">Select one</option>
                {HEARD_ABOUT.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <Err name="heardAbout" errors={errors} />
            </label>
          </div>
          <fieldset className="field-group">
            <legend className="legend">Are you a current client? *</legend>
            <div className="choices">
              <label className="choice">
                <input type="radio" id="currentClient" name="currentClient" value="yes" required /> Yes
              </label>
              <label className="choice">
                <input type="radio" name="currentClient" value="no" required /> No
              </label>
            </div>
            <Err name="currentClient" errors={errors} />
          </fieldset>
          <fieldset className="field-group">
            <legend className="legend">Have you been an IRA Ideas or Tax Academy client? *</legend>
            <div className="choices">
              <label className="choice">
                <input type="radio" id="academyClient" name="academyClient" value="yes" required /> Yes
              </label>
              <label className="choice">
                <input type="radio" name="academyClient" value="no" required /> No
              </label>
            </div>
            <Err name="academyClient" errors={errors} />
          </fieldset>
          <div className="form-actions">
            <button className="button button-ink next" type="button" onClick={() => validateStep(0) && go(1)}>
              Continue <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>

        {/* Step 2 — Your situation */}
        <div className="form-step" data-step="1" hidden={step !== 1}>
          <h4>Tell us about your situation.</h4>
          <label className="field">
            <span>Main reason for requesting the call *</span>
            <input id="mainReason" name="mainReason" required maxLength={180} placeholder="A brief headline for your request" {...invalid("mainReason")} />
            <Err name="mainReason" errors={errors} />
          </label>
          <label className="field">
            <span>What are you trying to accomplish? *</span>
            <textarea id="clientGoal" name="clientGoal" required maxLength={2000} placeholder="Describe the result you are working toward" {...invalid("clientGoal")} />
            <Err name="clientGoal" errors={errors} />
          </label>
          <label className="field">
            <span>What are you currently unsure about? *</span>
            <textarea id="clientQuestion" name="clientQuestion" required maxLength={2000} placeholder="What decision or question needs attention?" {...invalid("clientQuestion")} />
            <Err name="clientQuestion" errors={errors} />
          </label>
          <fieldset className="field-group">
            <legend className="legend">Is a specific transaction or decision involved? *</legend>
            <div className="choices">
              <label className="choice">
                <input type="radio" id="specificTransaction" name="specificTransaction" value="yes" required onChange={(e) => setTransaction(e.target.value)} /> Yes
              </label>
              <label className="choice">
                <input type="radio" name="specificTransaction" value="no" required onChange={(e) => setTransaction(e.target.value)} /> No
              </label>
            </div>
            <Err name="specificTransaction" errors={errors} />
          </fieldset>
          <label className="field conditional" hidden={transaction !== "yes"} style={{ marginTop: 17 }}>
            <span>Briefly explain the transaction or decision *</span>
            <textarea
              id="transactionSummary"
              name="transactionSummary"
              maxLength={1200}
              required={transaction === "yes"}
              placeholder="Keep this high level; please do not include sensitive identifiers"
              {...invalid("transactionSummary")}
            />
            <Err name="transactionSummary" errors={errors} />
          </label>
          <div className="field-grid" style={{ marginTop: 19 }}>
            <label className="field">
              <span>Relevant deadline or timing *</span>
              <input id="timingDeadline" name="timingDeadline" required maxLength={160} placeholder="For example, within 30 days" {...invalid("timingDeadline")} />
              <Err name="timingDeadline" errors={errors} />
            </label>
            <label className="field">
              <span>Account or plan type, if known</span>
              <select id="accountType" name="accountType" defaultValue="" {...invalid("accountType")}>
                <option value="">Select one, if known</option>
                {PLAN_TYPES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <Err name="accountType" errors={errors} />
            </label>
          </div>
          <label className="field" style={{ marginTop: 17 }}>
            <span>Related business or entity names, if relevant</span>
            <input id="relatedEntities" name="relatedEntities" maxLength={350} placeholder="Names only; no account numbers" {...invalid("relatedEntities")} />
            <Err name="relatedEntities" errors={errors} />
          </label>
          <label className="field">
            <span>Other people or entities materially involved, if relevant</span>
            <input id="relatedParties" name="relatedParties" maxLength={350} placeholder="Names and their role, if relevant" {...invalid("relatedParties")} />
            <Err name="relatedParties" errors={errors} />
          </label>
          <div className="form-actions">
            <button className="button button-light" type="button" onClick={() => go(0)}>
              ← Back
            </button>
            <button className="button button-ink next" type="button" onClick={() => validateStep(1) && go(2)}>
              Continue <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>

        {/* Step 3 — Review & consent */}
        <div className="form-step" data-step="2" hidden={step !== 2}>
          <h4>One final check.</h4>
          <div className="form-disclaimer">{consent.sensitiveWarning}</div>
          <div className="recording-note">
            <h5>{consent.recordingTitle}</h5>
            <p>{consent.recordingWhy}</p>
            <p className="recording-privacy">{consent.recordingPrivacy}</p>
          </div>
          <label className="checkline consent-line" hidden={alternative}>
            <input type="checkbox" id="recordingConsent" name="recordingConsent" required={!alternative} />
            <span>{consent.recording} *</span>
          </label>
          <div className="alt-consent">
            {alternative ? (
              <>
                <div className="alt-info">
                  Understood. Your request will be reviewed in writing, without a recorded call. If Tim accepts it, our team will contact you directly about next steps.
                </div>
                <button type="button" aria-expanded={alternative} onClick={() => setAlternative(false)}>
                  I can consent to recording after all
                </button>
              </>
            ) : (
              <>
                <em>{consent.noRecordingPrompt}</em>{" "}
                <button type="button" aria-expanded={alternative} onClick={() => setAlternative(true)}>
                  {consent.noRecordingOption}
                </button>
              </>
            )}
          </div>
          <Err name="recordingConsent" errors={errors} />
          <label className="checkline">
            <input type="checkbox" id="acknowledgeNoRelationship" name="acknowledgeNoRelationship" required />
            <span>{consent.noRelationship} *</span>
          </label>
          <Err name="acknowledgeNoRelationship" errors={errors} />

          {/* Honeypot for bots — hidden from people and screen readers */}
          <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
            <label>
              Website <input name="website" type="text" tabIndex={-1} autoComplete="off" />
            </label>
          </div>

          {formError && <div className="notice bad small">{formError}</div>}
          <div className="form-actions">
            <button className="button button-light" type="button" onClick={() => go(1)}>
              ← Back
            </button>
            <button className="button button-gold next" type="submit" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit request"} <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
        {formError && step !== 2 && <div className="notice bad small">{formError}</div>}
      </form>
    </div>
  );
}
