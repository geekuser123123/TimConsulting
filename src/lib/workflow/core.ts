import "server-only";
import { canTransition, type ConsultingRequest, type PipelineStatus, type RequestPatch } from "../domain";
import { getStore } from "../store";

export class WorkflowError extends Error {
  constructor(
    message: string,
    public code: "not_found" | "invalid_state" | "invalid_input" | "forbidden" = "invalid_state",
  ) {
    super(message);
  }
}

export type Actor = "tim" | "staff" | "client" | "system" | "stripe" | "scheduler" | "transcription" | "tape";

export const nowIso = () => new Date().toISOString();

export async function load(id: string): Promise<ConsultingRequest> {
  const r = await getStore().getRequest(id);
  if (!r) throw new WorkflowError(`Consulting request ${id} not found`, "not_found");
  return r;
}

/**
 * Apply a patch and (optionally) move the pipeline status, enforcing allowed transitions and
 * writing an audit entry. All status changes in the system go through here.
 */
export async function apply(
  req: ConsultingRequest,
  actor: Actor,
  action: string,
  patch: RequestPatch,
  opts: { to?: PipelineStatus; detail?: string } = {},
): Promise<ConsultingRequest> {
  const store = getStore();
  if (opts.to && opts.to !== req.status && !canTransition(req.status, opts.to)) {
    throw new WorkflowError(`Cannot move request from "${req.status}" to "${opts.to}"`);
  }
  const fullPatch: RequestPatch = opts.to ? { ...patch, status: opts.to } : patch;
  const statusNote = opts.to && opts.to !== req.status ? `status: ${req.status} → ${opts.to}` : undefined;
  const entry = { at: nowIso(), actor, action, detail: [statusNote, opts.detail].filter(Boolean).join("; ") || undefined };
  return store.updateRequest(req.id, fullPatch, entry);
}

export function firstName(req: ConsultingRequest): string {
  return req.clientName.split(" ")[0] || "there";
}

export function formatUsd(amount: number | undefined): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount ?? 0);
}

export function formatWhen(iso: string | undefined, timeZone = process.env.DISPLAY_TIME_ZONE || "America/Chicago"): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  }).format(new Date(iso));
}
