import type { AuditEntry, Contact, ConsultingRequest, NewConsultingRequest, PipelineStatus, RequestPatch } from "../domain";

export interface MatterInput {
  requestId: string;
  contactId: string;
  title: string;
  summary: string;
  deliverables?: string;
}

export interface TaskInput {
  matterId: string;
  requestId: string;
  title: string;
  assignee: "staff" | "tim";
  description?: string;
}

/** Fields a request can be looked up by (used by webhooks to match provider events). */
export type RequestLookupField = "calendarEventId" | "meetingUrl" | "stripeCheckoutId";

/**
 * The CRM of record. Production uses Tape (tape.ts); development and tests use the in-memory
 * implementation (memory.ts). Workflow code only ever talks to this interface.
 */
export interface CrmStore {
  findContact(email: string, phone: string): Promise<Contact | null>;
  createContact(data: Omit<Contact, "id">): Promise<Contact>;
  updateContact(id: string, data: Partial<Omit<Contact, "id">>): Promise<Contact>;

  createRequest(data: NewConsultingRequest): Promise<ConsultingRequest>;
  getRequest(id: string): Promise<ConsultingRequest | null>;
  updateRequest(id: string, patch: RequestPatch): Promise<ConsultingRequest>;
  listRequests(statuses?: PipelineStatus[]): Promise<ConsultingRequest[]>;
  findRequestBy(field: RequestLookupField, value: string): Promise<ConsultingRequest | null>;
  appendAudit(id: string, entry: AuditEntry): Promise<void>;

  createMatter(data: MatterInput): Promise<{ id: string }>;
  createTask(data: TaskInput): Promise<{ id: string }>;
}
