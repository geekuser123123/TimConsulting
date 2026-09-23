import "server-only";
import { config } from "../config";
import { MemoryStore } from "./memory";
import type { CrmStore } from "./types";

const g = globalThis as unknown as { __crmStore?: CrmStore };

export function getStore(): CrmStore {
  if (!g.__crmStore) {
    if (config.crm.driver === "tape") {
      // Imported lazily so the memory driver never needs Tape credentials.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { TapeStore } = require("./tape") as typeof import("./tape");
      g.__crmStore = new TapeStore();
    } else {
      if (process.env.NODE_ENV === "production" && process.env.ALLOW_MEMORY_STORE_IN_PRODUCTION !== "true") {
        throw new Error("CRM_DRIVER=memory is not allowed in production. Set CRM_DRIVER=tape.");
      }
      g.__crmStore = new MemoryStore(config.crm.memoryFile);
    }
  }
  return g.__crmStore;
}

/** Test hook: replace the store (e.g. with a fresh MemoryStore). */
export function setStore(store: CrmStore | undefined) {
  g.__crmStore = store;
}

export type { CrmStore } from "./types";
