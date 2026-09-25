"use client";

import { useActionState } from "react";
import type { ConsultingRequest } from "@/lib/domain";
import { closeMatterAction, saveDiagnosisAction, saveScopeAction, uploadTranscriptAction, type FormState } from "../../actions";

function Status({ state }: { state: FormState }) {
  if (state?.error) return <div className="notice bad small">{state.error}</div>;
  if (state?.ok) return <div className="notice ok small">{state.ok}</div>;
  return null;
}

function Area({ name, label, value, hint, rows = 4 }: { name: string; label: string; value?: string; hint?: string; rows?: number }) {
  return (
    <div className="field">
      <label htmlFor={name}>
        {label}
        {hint && <span className="hint">{hint}</span>}
      </label>
      <textarea id={name} name={name} defaultValue={value ?? ""} rows={rows} />
    </div>
  );
}

export function ScopeForm({ req, editable }: { req: ConsultingRequest; editable: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveScopeAction.bind(null, req.id), undefined);
  return (
    <form action={action}>
      <fieldset disabled={!editable || pending}>
        <Area name="scopeSituation" label="Your Situation (client-facing)" hint="Short, plain-English summary of what the client is trying to solve." value={req.scopeSituation} />
        <Area name="scopeProposedWork" label="Proposed Work" hint="Exactly what Tim/the firm will do." value={req.scopeProposedWork} />
        <Area name="scopeDeliverables" label="Deliverables" hint="What the client will receive." value={req.scopeDeliverables} />
        <Area name="scopeExclusions" label="Not Included" value={req.scopeExclusions} />
        <Area name="scopeClientResponsibilities" label="Client Responsibilities" hint="Information/documents the client must provide." value={req.scopeClientResponsibilities} />
        <Area name="scopeAdditionalServices" label="Additional services requiring a separate engagement (optional)" value={req.scopeAdditionalServices} rows={2} />
        <div className="grid-2">
          <div className="field">
            <label htmlFor="feeType">Fee Type</label>
            <select id="feeType" name="feeType" defaultValue={req.feeType ?? ""}>
              <option value="">Select…</option>
              <option>Fixed Fee</option>
              <option>Hourly</option>
              <option>Retainer</option>
              <option>No Charge</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="feeAmount">Fee Amount (USD)</label>
            <input id="feeAmount" name="feeAmount" type="number" min="0" step="0.01" defaultValue={req.feeAmount ?? ""} />
          </div>
        </div>
        <div className="check">
          <label>
            <input type="checkbox" name="paymentRequired" defaultChecked={req.paymentRequired} /> Payment required before work begins
          </label>
        </div>
        <div className="check">
          <label>
            <input type="checkbox" name="initialDocumentsRequired" defaultChecked={req.initialDocumentsRequired} /> Initial documents must be received before the matter opens
          </label>
        </div>
        <Status state={state} />
        {editable && (
          <div className="btn-row">
            <button className="btn btn-secondary" type="submit" name="intent" value="save">
              Save draft
            </button>
            <button className="btn btn-primary" type="submit" name="intent" value="submit">
              Submit to Tim for approval
            </button>
          </div>
        )}
      </fieldset>
    </form>
  );
}

export function DiagnosisForm({ req }: { req: ConsultingRequest }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveDiagnosisAction.bind(null, req.id), undefined);
  return (
    <form action={action}>
      <fieldset disabled={pending}>
        <Area name="diagClientGoal" label="Client Goal" value={req.diagClientGoal} rows={2} />
        <Area name="diagCurrentSituation" label="Current Situation" value={req.diagCurrentSituation} rows={3} />
        <Area name="diagPrimaryIssue" label="Primary Issue" value={req.diagPrimaryIssue} rows={2} />
        <Area name="diagSecondaryIssues" label="Secondary Issues" value={req.diagSecondaryIssues} rows={2} />
        <Area name="diagKeyFacts" label="Key / Relevant Facts" value={req.diagKeyFacts} />
        <Area name="diagFactsStillNeeded" label="Facts / Documents Still Needed" value={req.diagFactsStillNeeded} rows={3} />
        <div className="field">
          <label htmlFor="diagAttorneyWorkRequired">Attorney Work Required?</label>
          <select id="diagAttorneyWorkRequired" name="diagAttorneyWorkRequired" defaultValue={req.diagAttorneyWorkRequired ?? ""}>
            <option value="">—</option>
            <option>Yes</option>
            <option>No</option>
            <option>Unclear</option>
          </select>
        </div>
        <Area name="diagRecommendedNextStep" label="Recommended Work / Next Step" value={req.diagRecommendedNextStep} rows={2} />
        <Area name="diagRecommendedDeliverable" label="Recommended Deliverable" value={req.diagRecommendedDeliverable} rows={2} />
        <Area name="diagDocumentsNeeded" label="Documents Needed" value={req.diagDocumentsNeeded} rows={2} />
        <Area name="internalComments" label="Internal Comments" value={req.internalComments} rows={2} />
        <Status state={state} />
        <button className="btn btn-secondary" type="submit">
          Save diagnosis
        </button>
      </fieldset>
    </form>
  );
}

export function TranscriptForm({ req }: { req: ConsultingRequest }) {
  const [state, action, pending] = useActionState<FormState, FormData>(uploadTranscriptAction.bind(null, req.id), undefined);
  return (
    <form action={action}>
      <fieldset disabled={pending}>
        <p className="small muted">Use this only if the recording provider didn&rsquo;t deliver the transcript automatically.</p>
        <div className="field">
          <label htmlFor="transcriptFile">Transcript file (.txt / .vtt)</label>
          <input id="transcriptFile" name="transcriptFile" type="file" accept=".txt,.vtt,text/plain,text/vtt" />
        </div>
        <Area name="transcriptText" label="…or paste transcript" rows={4} />
        <div className="grid-2">
          <div className="field">
            <label htmlFor="recordingUrl">Recording URL (access-controlled)</label>
            <input id="recordingUrl" name="recordingUrl" type="text" />
          </div>
          <div className="field">
            <label htmlFor="transcriptUrl">Transcript URL (access-controlled)</label>
            <input id="transcriptUrl" name="transcriptUrl" type="text" />
          </div>
        </div>
        <Status state={state} />
        <button className="btn btn-secondary" type="submit">
          {pending ? "Attaching…" : "Attach transcript"}
        </button>
      </fieldset>
    </form>
  );
}

/** Close a matter once the work is done; the tick box prevents accidental closing. */
export function CloseMatterForm({ req }: { req: ConsultingRequest }) {
  const [state, action, pending] = useActionState<FormState, FormData>(closeMatterAction.bind(null, req.id), undefined);
  return (
    <form action={action} style={{ marginTop: 20, borderTop: "1px solid var(--line)", paddingTop: 16 }}>
      <fieldset disabled={pending}>
        <h3 style={{ marginTop: 0 }}>Close this matter</h3>
        <p className="small muted">When all the work for this client is finished. The request moves to &ldquo;Finished&rdquo;.</p>
        <div className="field">
          <label htmlFor="closeNote">
            Closing note <span className="hint">Optional, e.g. &ldquo;Memo delivered 10/14&rdquo;. Saved in the audit trail.</span>
          </label>
          <input id="closeNote" name="note" type="text" maxLength={500} />
        </div>
        <label className="check" style={{ display: "flex", gap: 8, alignItems: "flex-start", fontWeight: 400 }}>
          <input type="checkbox" name="confirm" required /> <span>The work for this client is complete.</span>
        </label>
        <Status state={state} />
        <button className="btn btn-secondary" type="submit">
          {pending ? "Closing…" : "Mark matter closed"}
        </button>
      </fieldset>
    </form>
  );
}
