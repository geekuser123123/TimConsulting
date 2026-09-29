"use client";

import { useFormStatus } from "react-dom";

/**
 * A submit button that switches to a "working" label and disables itself while its form is being
 * submitted, so a second click can't submit (and email) twice.
 */
export function PendingButton({ label, pendingLabel, className, disabled }: { label: React.ReactNode; pendingLabel: string; className: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className={className} type="submit" disabled={disabled || pending} aria-busy={pending}>
      {pending ? (
        <>
          <span className="spinner" aria-hidden="true" /> {pendingLabel}
        </>
      ) : (
        label
      )}
    </button>
  );
}
