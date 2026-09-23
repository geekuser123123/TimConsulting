import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { AuditEntry, Contact, ConsultingRequest, NewConsultingRequest, PipelineStatus, RequestPatch } from "../domain";
import type { CrmStore, MatterInput, RequestLookupField, TaskInput } from "./types";
import { normalizeEmail, normalizePhone } from "../normalize";

interface MemoryData {
  contacts: Contact[];
  requests: ConsultingRequest[];
  matters: (MatterInput & { id: string })[];
  tasks: (TaskInput & { id: string })[];
}

/**
 * In-memory CRM used for local development and the acceptance test suite.
 * Optionally persisted to a JSON file (MEMORY_STORE_FILE) so the dev server survives reloads.
 */
export class MemoryStore implements CrmStore {
  data: MemoryData = { contacts: [], requests: [], matters: [], tasks: [] };

  constructor(private file?: string) {
    if (file && fs.existsSync(file)) {
      this.data = JSON.parse(fs.readFileSync(file, "utf8")) as MemoryData;
    }
  }

  private save() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }

  async findContact(email: string, phone: string) {
    const e = normalizeEmail(email);
    const p = normalizePhone(phone);
    return (
      this.data.contacts.find((c) => normalizeEmail(c.email) === e) ??
      (p ? this.data.contacts.find((c) => normalizePhone(c.phone) === p) : undefined) ??
      null
    );
  }

  async createContact(data: Omit<Contact, "id">) {
    const c: Contact = { ...data, id: `contact_${randomUUID()}` };
    this.data.contacts.push(c);
    this.save();
    return structuredClone(c);
  }

  async updateContact(id: string, data: Partial<Omit<Contact, "id">>) {
    const c = this.data.contacts.find((x) => x.id === id);
    if (!c) throw new Error(`Contact ${id} not found`);
    Object.assign(c, data);
    this.save();
    return structuredClone(c);
  }

  async createRequest(data: NewConsultingRequest) {
    const r: ConsultingRequest = { ...structuredClone(data), id: `req_${randomUUID()}` };
    this.data.requests.push(r);
    this.save();
    return structuredClone(r);
  }

  async getRequest(id: string) {
    const r = this.data.requests.find((x) => x.id === id);
    return r ? structuredClone(r) : null;
  }

  async updateRequest(id: string, patch: RequestPatch) {
    const r = this.data.requests.find((x) => x.id === id);
    if (!r) throw new Error(`Request ${id} not found`);
    Object.assign(r, structuredClone(patch));
    this.save();
    return structuredClone(r);
  }

  async listRequests(statuses?: PipelineStatus[]) {
    return this.data.requests
      .filter((r) => !statuses || statuses.includes(r.status))
      .map((r) => structuredClone(r))
      .sort((a, b) => a.requestDate.localeCompare(b.requestDate));
  }

  async findRequestBy(field: RequestLookupField, value: string) {
    const r = this.data.requests.find((x) => x[field] === value);
    return r ? structuredClone(r) : null;
  }

  async appendAudit(id: string, entry: AuditEntry) {
    const r = this.data.requests.find((x) => x.id === id);
    if (!r) throw new Error(`Request ${id} not found`);
    r.auditLog.push(entry);
    this.save();
  }

  async createMatter(data: MatterInput) {
    const m = { ...data, id: `matter_${randomUUID()}` };
    this.data.matters.push(m);
    this.save();
    return { id: m.id };
  }

  async createTask(data: TaskInput) {
    const t = { ...data, id: `task_${randomUUID()}` };
    this.data.tasks.push(t);
    this.save();
    return { id: t.id };
  }
}
