/**
 * Tape CRM adapter (production). See tape-core.ts for the API client and field codecs.
 *
 * Each app's live field list is fetched once and cached for a few minutes, so field IDs and
 * category option IDs never need to be copied into configuration. Credentials stay server-side.
 */
import "server-only";
import { config } from "../config";
import type { AuditEntry, Contact, ConsultingRequest, NewConsultingRequest, PipelineStatus, RequestPatch } from "../domain";
import { normalizeEmail, normalizePhone } from "../normalize";
import { AppSchema, TapeApiError, TapeClient, TapeSchemaError, type TapeRecord } from "./tape-core";
import { CONTACT_FIELDS, MATTER_FIELDS, REQUEST_FIELDS, TASK_FIELDS, type TapeFieldDef } from "./tape-schema";
import type { CrmStore, MatterInput, RequestLookupField, TaskInput } from "./types";

export { TapeApiError, TapeClient } from "./tape-core";

type RequestKey = keyof typeof REQUEST_FIELDS;
type ContactKey = keyof typeof CONTACT_FIELDS;

const SCHEMA_TTL_MS = 5 * 60 * 1000;

export interface TapeStoreOptions {
  client: TapeClient;
  appIds: {
    contacts: string;
    requests: string;
    matters: string;
    tasks?: string;
  };
}

export class TapeStore implements CrmStore {
  private schemas = new Map<string, { at: number; schema: Promise<AppSchema> }>();
  private readonly client: TapeClient;
  private readonly apps: TapeStoreOptions["appIds"];

  constructor(opts?: TapeStoreOptions) {
    this.client =
      opts?.client ??
      new TapeClient({
        baseUrl: config.tape.baseUrl,
        apiKey: config.tape.apiKey,
      });
    this.apps = opts?.appIds ?? {
      contacts: config.tape.contactsAppId,
      requests: config.tape.requestsAppId,
      matters: config.tape.mattersAppId,
      tasks: config.tape.tasksAppId,
    };
  }

  private schema<K extends string>(appId: string, defs: Record<K, TapeFieldDef>, refresh = false): Promise<AppSchema<K>> {
    const hit = this.schemas.get(appId);
    if (!refresh && hit && Date.now() - hit.at < SCHEMA_TTL_MS) return hit.schema as Promise<AppSchema<K>>;
    const schema = this.client.getApp(appId).then((app) => new AppSchema(app, defs));
    schema.catch(() => this.schemas.delete(appId));
    this.schemas.set(appId, {
      at: Date.now(),
      schema: schema as Promise<AppSchema>,
    });
    return schema;
  }

  /** Run `fn` with the app's schema; if a field/option is missing, re-read the app once and retry. */
  private async withSchema<K extends string, T>(appId: string, defs: Record<K, TapeFieldDef>, fn: (s: AppSchema<K>) => Promise<T>): Promise<T> {
    try {
      return await fn(await this.schema(appId, defs));
    } catch (e) {
      if (!(e instanceof TapeSchemaError)) throw e;
      return fn(await this.schema(appId, defs, true));
    }
  }

  private requests<T>(fn: (s: AppSchema<RequestKey>) => Promise<T>) {
    return this.withSchema(this.apps.requests, REQUEST_FIELDS, fn);
  }
  private contacts<T>(fn: (s: AppSchema<ContactKey>) => Promise<T>) {
    return this.withSchema(this.apps.contacts, CONTACT_FIELDS, fn);
  }

  private toRequest(s: AppSchema<RequestKey>, record: TapeRecord): ConsultingRequest {
    const d = s.decode(record) as unknown as Omit<ConsultingRequest, "id">;
    return {
      ...d,
      auditLog: Array.isArray(d.auditLog) ? d.auditLog : [],
      id: String(record.record_id),
    };
  }
  private toContact(s: AppSchema<ContactKey>, record: TapeRecord): Contact {
    return {
      ...(s.decode(record) as unknown as Omit<Contact, "id">),
      id: String(record.record_id),
    };
  }

  // -- Contacts ---------------------------------------------------------------------------------

  findContact(email: string, phone: string): Promise<Contact | null> {
    return this.contacts(async (s) => {
      const e = normalizeEmail(email);
      const emailField = s.field("email");
      const byEmail = await this.client.filterRecords(
        this.apps.contacts,
        [
          {
            field: emailField,
            match: emailField.field_type === "multi_email" ? "fully_includes" : "equal",
            values: [e],
          },
        ],
        10,
      );
      const hit = byEmail.map((r) => this.toContact(s, r)).find((c) => normalizeEmail(c.email ?? "") === e);
      if (hit) return hit;

      const p = normalizePhone(phone);
      if (p.length < 7) return null;
      const byPhone = await this.client.filterRecords(
        this.apps.contacts,
        [
          {
            field: s.field("phone"),
            match: "ends_with",
            values: [p.slice(-4)],
          },
        ],
        50,
      );
      return byPhone.map((r) => this.toContact(s, r)).find((c) => normalizePhone(c.phone ?? "") === p) ?? null;
    });
  }

  createContact(data: Omit<Contact, "id">) {
    return this.contacts(async (s) => this.toContact(s, await this.client.createRecord(this.apps.contacts, s.encode(data))));
  }

  updateContact(id: string, data: Partial<Omit<Contact, "id">>) {
    return this.contacts(async (s) => this.toContact(s, await this.client.updateRecord(id, s.encode(data, { clear: true }))));
  }

  // -- Consulting requests ----------------------------------------------------------------------

  createRequest(data: NewConsultingRequest) {
    return this.requests(async (s) => this.toRequest(s, await this.client.createRecord(this.apps.requests, s.encode(data))));
  }

  async getRequest(id: string) {
    if (!/^\d+$/.test(id)) return null;
    let rec: TapeRecord;
    try {
      rec = await this.client.getRecord(id);
    } catch (e) {
      if (e instanceof TapeApiError && (e.status === 404 || e.status === 400 || e.status === 403)) return null;
      throw e;
    }
    if (rec.app && String(rec.app.app_id) !== String(this.apps.requests)) return null;
    return this.requests(async (s) => this.toRequest(s, rec));
  }

  updateRequest(id: string, patch: RequestPatch, audit?: AuditEntry) {
    return this.requests(async (s) => {
      const fields = { ...patch } as Partial<ConsultingRequest>;
      if (audit) {
        // The audit trail is one JSON field, so appending means read → append → write. Doing it in
        // the same PUT as the patch keeps it to two API calls per workflow step.
        const current = await this.client.getRecord(id);
        const log = this.toRequest(s, current).auditLog;
        fields.auditLog = [...log, audit];
      }
      return this.toRequest(s, await this.client.updateRecord(id, s.encode(fields, { clear: true })));
    });
  }

  async appendAudit(id: string, entry: AuditEntry) {
    await this.updateRequest(id, {}, entry);
  }

  listRequests(statuses?: PipelineStatus[]) {
    return this.requests(async (s) => {
      if (statuses && !statuses.length) return [];
      const filters = statuses
        ? [
            {
              field: s.field("status"),
              match: "any",
              values: statuses as string[],
            },
          ]
        : [];
      const records = await this.client.filterRecords(this.apps.requests, filters, 5000);
      return records
        .map((r) => this.toRequest(s, r))
        .filter((r) => !statuses || statuses.includes(r.status))
        .sort((a, b) => (a.requestDate ?? "").localeCompare(b.requestDate ?? ""));
    });
  }

  findRequestBy(field: RequestLookupField, value: string) {
    return this.requests(async (s) => {
      const records = await this.client.filterRecords(this.apps.requests, [{ field: s.field(field), match: "equal", values: [value] }], 5);
      return records.map((r) => this.toRequest(s, r)).find((r) => r[field] === value) ?? null;
    });
  }

  // -- Matters & tasks --------------------------------------------------------------------------

  createMatter(data: MatterInput) {
    return this.withSchema(this.apps.matters, MATTER_FIELDS, async (s) => {
      const rec = await this.client.createRecord(this.apps.matters, s.encode(data));
      return { id: String(rec.record_id) };
    });
  }

  async createTask(data: TaskInput) {
    const appId = this.apps.tasks;
    if (!appId) return { id: "" };
    return this.withSchema(appId, TASK_FIELDS, async (s) => {
      const rec = await this.client.createRecord(appId, s.encode(data));
      return { id: String(rec.record_id) };
    });
  }
}

/** A Tape API client using the configured credentials (for webhook verification etc.). */
export function tapeClient() {
  return new TapeClient({ baseUrl: config.tape.baseUrl, apiKey: config.tape.apiKey });
}
