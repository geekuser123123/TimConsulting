"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { acceptProposalAction, declineProposalAction, signEngagementAction, type ActionState } from "../../actions";

function Submit({ label, pending, className = "btn btn-primary" }: { label: string; pending: string; className?: string }) {
  const { pending: isPending } = useFormStatus();
  return (
    <button className={className} type="submit" disabled={isPending}>
      {isPending ? pending : label}
    </button>
  );
}

export function AcceptButton({ token }: { token: string }) {
  const [state, action] = useActionState<ActionState>(acceptProposalAction.bind(null, token), undefined);
  return (
    <form action={action}>
      <Submit label="Accept" pending="Accepting…" className="btn btn-ok" />
      {state?.error && <div className="error">{state.error}</div>}
    </form>
  );
}

export function DeclineForm({ token, reasons }: { token: string; reasons: string[] }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionState, FormData>(declineProposalAction.bind(null, token), undefined);
  if (!open) {
    return (
      <div className="btn-row">
        <button className="btn btn-bad" type="button" onClick={() => setOpen(true)}>
          Decline
        </button>
      </div>
    );
  }
  return (
    <form action={action} className="card" style={{ marginTop: 16 }}>
      <div className="field">
        <label htmlFor="reason">
          What made you decide not to move forward? <span className="muted">(optional)</span>
        </label>
        <select id="reason" name="reason" defaultValue="">
          <option value="">Prefer not to say</option>
          {reasons.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="comment">
          Anything else? <span className="muted">(optional)</span>
        </label>
        <textarea id="comment" name="comment" maxLength={2000} />
      </div>
      {state?.error && <div className="error">{state.error}</div>}
      <div className="btn-row">
        <Submit label="Decline proposal" pending="Submitting…" className="btn btn-bad" />
        <button className="btn btn-secondary" type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function SignForm({ token, consent }: { token: string; consent: string }) {
  const [state, action] = useActionState<ActionState, FormData>(signEngagementAction.bind(null, token), undefined);
  return (
    <form action={action}>
      <div className="check">
        <label>
          <input type="checkbox" name="agree" required />
          <span>{consent}</span>
        </label>
      </div>
      <div className="field">
        <label htmlFor="signedName">Full legal name</label>
        <input id="signedName" name="signedName" type="text" required minLength={2} maxLength={200} autoComplete="name" />
      </div>
      {state?.error && <div className="error">{state.error}</div>}
      <Submit label="Sign and continue" pending="Signing…" />
    </form>
  );
}
