"use client";

import { useFormStatus } from "react-dom";

/**
 * A submit button that switches to a "working" label and disables itself while its form is being
 * submitted, so a second click can't submit (and email) twice. With `name`/`value` (forms with
 * several submit buttons), only the button that was clicked shows the working label.
 */
export function PendingButton({
  label,
  pendingLabel,
  className,
  disabled,
  name,
  value,
}: {
  label: React.ReactNode;
  pendingLabel: string;
  className: string;
  disabled?: boolean;
  name?: string;
  value?: string;
}) {
  const { pending, data } = useFormStatus();
  const mine = pending && (!name || data?.get(name) === value);
  return (
    <button className={className} type="submit" name={name} value={value} disabled={disabled || pending} aria-busy={mine}>
      {mine ? (
        <>
          <span className="spinner" aria-hidden="true" /> {pendingLabel}
        </>
      ) : (
        label
      )}
    </button>
  );
}
