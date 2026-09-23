/**
 * Tape CRM adapter (production).
 *
 * Uses only Tape's supported REST record API — never the beta Automation API.
 * Credentials stay server-side (this module imports "server-only").
 *
 * Everything that depends on Tape's exact wire format lives in the small `TapeClient` class
 * and the `encode`/`decode` helpers below, so if Tape's API differs from what's assumed here
 * only this file changes. Run `npm run tape:check` against the real workspace before launch;
 * see docs/TAPE_SETUP.md → "Verifying the API adapter".
 */
import "server-only";
import { config } from "../config";
import type { AuditEntry, Contact, ConsultingRequest, NewConsultingRequest, PipelineStatus, RequestPatch } from "../domain";
import { normalizeEmail, normalizePhone } from "../normalize";
import { CONTACT_FIELDS, MATTER_FIELDS, REQUEST_FIELDS, TASK_FIELDS, type TapeFieldDef } from "./tape-schema";
import type { CrmStore, MatterInput, RequestLookupField, TaskInput } from "./types";

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

interface TapeFieldValue {
  field_id?: number;
  external_id?: string;
  type?: string;
  values?: Json[];
}
export interface TapeRecord {
  record_id: number;
  app_id?: number;
  title?: string;
  fields: TapeFieldValue[];
}

export class TapeApiError extends Error {
  constructor(
    public status: number,
    public body: string,
    message: string,
  ) {
    super(message);
  }
}

export class TapeClient {
  constructor(
    private baseUrl = config.tape.baseUrl,
    private apiKey = config.tape.apiKey,
    private scheme = config.tape.authScheme,
  ) {}

  private headers(): HeadersInit {
    const auth =
      this.scheme === "basic"
        ? `Basic ${Buffer.from(`${this.apiKey}:`).toString("base64")}`
        : `Bearer ${this.apiKey}`;
    return { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" };
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: this.headers(),
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
      });
      if (res.status === 429 && attempt < 3) {
        const retryAfter = Number(res.headers.get("retry-after")) || 2 ** attempt;
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        continue;
      }
      const text = await res.text();
      if (!res.ok) {
        // Never include request bodies in errors — they may contain client information.
        throw new TapeApiError(res.status, text.slice(0, 500), `Tape API ${method} ${path} failed with ${res.status}`);
      }
      return (text ? JSON.parse(text) : {}) as T;
    }
  }

  createRecord(appId: string, fields: Record<string, Json>) {
    return this.request<TapeRecord>("POST", `/record/app/${appId}`, { fields });
  }
  getRecord(recordId: string) {
    return this.request<TapeRecord>("GET", `/record/${recordId}`);
  }
  updateRecord(recordId: string, fields: Record<string, Json>) {
    return this.request<TapeRecord>("PUT", `/record/${recordId}`, { fields });
  }
  getApp(appId: string) {
    return this.request<{ app_id: number; name?: string; fields: { field_id: number; external_id: string; type: string; label?: string }[] }>(
      "GET",
      `/app/${appId}`,
    );
  }

  /** Filter records of an app where `externalId` equals one of `values`. */
  async filterRecords(appId: string, filters: { externalId: string; type: string; values: string[] }[], limit = 500) {
    const out: TapeRecord[] = [];
    let cursor: string | undefined;
    do {
      const res = await this.request<{ records: TapeRecord[]; cursor?: string | null; has_more?: boolean }>(
        "POST",
        `/record/app/${appId}/filter`,
        {
          filters: filters.map((f) => ({ field_id: f.externalId, type: f.type, match_type: "equal", values: f.values })),
          limit: Math.min(limit, 500),
          ...(cursor ? { cursor } : {}),
        },
      );
      out.push(...(res.records ?? []));
      cursor = res.has_more && res.cursor ? res.cursor : undefined;
    } while (cursor && out.length < limit);
    return out;
  }
}

// ---------------------------------------------------------------------------------------------
// Value encoding / decoding
// ---------------------------------------------------------------------------------------------

function tapeDate(iso: string): { start: string } {
  // Tape date fields take "YYYY-MM-DD HH:mm:ss" in UTC.
  const d = new Date(iso);
  return { start: d.toISOString().replace("T", " ").slice(0, 19) };
}

export function encodeValue(def: TapeFieldDef, value: unknown): Json {
  if (value === undefined || value === null || value === "") return null;
  if (def.json) return JSON.stringify(value);
  switch (def.type) {
    case "text":
    case "long_text":
      return String(value);
    case "email":
      return [{ type: "work", value: String(value) }];
    case "phone":
      return [{ type: "mobile", value: String(value) }];
    case "category":
      return String(value);
    case "yes_no":
      return value ? "Yes" : "No";
    case "date":
      return tapeDate(String(value));
    case "number":
      return Number(value);
    case "relation":
      return [Number(value)];
  }
}

function first(values: Json[] | undefined): Json | undefined {
  return values && values.length ? values[0] : undefined;
}

function unwrap(v: Json | undefined): Json | undefined {
  if (v && typeof v === "object" && !Array.isArray(v) && "value" in v) return v.value;
  return v;
}

export function decodeValue(def: TapeFieldDef, field: TapeFieldValue | undefined): unknown {
  if (!field) return undefined;
  const raw = unwrap(first(field.values));
  if (raw === undefined || raw === null) return def.type === "yes_no" ? false : undefined;
  if (def.json) {
    try {
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      return [];
    }
  }
  switch (def.type) {
    case "text":
    case "long_text":
    case "email":
    case "phone":
      return typeof raw === "string" ? raw : String(raw);
    case "category": {
      if (typeof raw === "object" && !Array.isArray(raw) && raw && "text" in raw) return raw.text;
      return String(raw);
    }
    case "yes_no": {
      const text = typeof raw === "object" && !Array.isArray(raw) && raw && "text" in raw ? raw.text : raw;
      return text === "Yes" || text === true;
    }
    case "date": {
      const start = typeof raw === "object" && !Array.isArray(raw) && raw && "start" in raw ? raw.start : raw;
      return start ? new Date(`${String(start).replace(" ", "T")}Z`).toISOString() : undefined;
    }
    case "number":
      return Number(raw);
    case "relation": {
      const id = typeof raw === "object" && !Array.isArray(raw) && raw && "record_id" in raw ? raw.record_id : raw;
      return String(id);
    }
  }
}

function encodeFields<K extends string>(defs: Record<K, TapeFieldDef>, data: Partial<Record<K, unknown>>): Record<string, Json> {
  const out: Record<string, Json> = {};
  for (const key of Object.keys(data) as K[]) {
    const def = defs[key];
    if (!def) continue;
    out[def.externalId] = encodeValue(def, data[key]);
  }
  return out;
}

function decodeFields<K extends string>(defs: Record<K, TapeFieldDef>, record: TapeRecord): Record<K, unknown> {
  const byExt = new Map(record.fields.map((f) => [f.external_id, f]));
  const out = {} as Record<K, unknown>;
  for (const key of Object.keys(defs) as K[]) {
    out[key] = decodeValue(defs[key], byExt.get(defs[key].externalId));
  }
  return out;
}

function toRequest(record: TapeRecord): ConsultingRequest {
  const d = decodeFields(REQUEST_FIELDS, record) as Omit<ConsultingRequest, "id">;
  return { ...d, auditLog: Array.isArray(d.auditLog) ? d.auditLog : [], id: String(record.record_id) };
}

function toContact(record: TapeRecord): Contact {
  const d = decodeFields(CONTACT_FIELDS, record) as Omit<Contact, "id">;
  return { ...d, id: String(record.record_id) };
}

// ---------------------------------------------------------------------------------------------

export class TapeStore implements CrmStore {
  constructor(private client = new TapeClient()) {}

  async findContact(email: string, phone: string): Promise<Contact | null> {
    const appId = config.tape.contactsAppId;
    const byEmail = await this.client.filterRecords(appId, [{ externalId: CONTACT_FIELDS.email.externalId, type: "email", values: [normalizeEmail(email)] }], 5);
    const emailMatch = byEmail.map(toContact).find((c) => normalizeEmail(c.email ?? "") === normalizeEmail(email));
    if (emailMatch) return emailMatch;
    const p = normalizePhone(phone);
    if (!p) return null;
    const byPhone = await this.client.filterRecords(appId, [{ externalId: CONTACT_FIELDS.phone.externalId, type: "phone", values: [phone, p] }], 5);
    return byPhone.map(toContact).find((c) => normalizePhone(c.phone ?? "") === p) ?? null;
  }

  async createContact(data: Omit<Contact, "id">) {
    return toContact(await this.client.createRecord(config.tape.contactsAppId, encodeFields(CONTACT_FIELDS, data)));
  }

  async updateContact(id: string, data: Partial<Omit<Contact, "id">>) {
    return toContact(await this.client.updateRecord(id, encodeFields(CONTACT_FIELDS, data)));
  }

  async createRequest(data: NewConsultingRequest) {
    return toRequest(await this.client.createRecord(config.tape.requestsAppId, encodeFields(REQUEST_FIELDS, data)));
  }

  async getRequest(id: string) {
    try {
      const rec = await this.client.getRecord(id);
      if (rec.app_id !== undefined && String(rec.app_id) !== String(config.tape.requestsAppId)) return null;
      return toRequest(rec);
    } catch (e) {
      if (e instanceof TapeApiError && (e.status === 404 || e.status === 400)) return null;
      throw e;
    }
  }

  async updateRequest(id: string, patch: RequestPatch) {
    return toRequest(await this.client.updateRecord(id, encodeFields(REQUEST_FIELDS, patch)));
  }

  async listRequests(statuses?: PipelineStatus[]) {
    const filters = statuses ? [{ externalId: REQUEST_FIELDS.status.externalId, type: "category", values: statuses as string[] }] : [];
    const records = await this.client.filterRecords(config.tape.requestsAppId, filters, 1000);
    return records.map(toRequest).sort((a, b) => (a.requestDate ?? "").localeCompare(b.requestDate ?? ""));
  }

  async findRequestBy(field: RequestLookupField, value: string) {
    const def = REQUEST_FIELDS[field];
    const records = await this.client.filterRecords(config.tape.requestsAppId, [{ externalId: def.externalId, type: "text", values: [value] }], 5);
    return records.map(toRequest).find((r) => r[field] === value) ?? null;
  }

  async appendAudit(id: string, entry: AuditEntry) {
    const current = await this.getRequest(id);
    if (!current) throw new Error(`Request ${id} not found`);
    const log = [...current.auditLog, entry];
    await this.client.updateRecord(id, { [REQUEST_FIELDS.auditLog.externalId]: JSON.stringify(log) });
  }

  async createMatter(data: MatterInput) {
    const rec = await this.client.createRecord(config.tape.mattersAppId, encodeFields(MATTER_FIELDS, data));
    return { id: String(rec.record_id) };
  }

  async createTask(data: TaskInput) {
    const appId = config.tape.tasksAppId;
    if (!appId) return { id: "" };
    const rec = await this.client.createRecord(appId, encodeFields(TASK_FIELDS, data));
    return { id: String(rec.record_id) };
  }
}
