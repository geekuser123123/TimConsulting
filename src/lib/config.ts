/**
 * Server-side configuration. Everything secret is read from the environment and must never be
 * imported into a client component. See .env.example for documentation of each variable.
 */
import "server-only";

function env(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v === undefined || v === "") {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required environment variable ${name}`);
  }
  return v;
}

/** Dev-only fallbacks: in production the variable must be set explicitly. */
function devDefault(value: string): string | undefined {
  return process.env.NODE_ENV === "production" ? undefined : value;
}

function envBool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) throw new Error(`${name} must be an integer`);
  return n;
}

/**
 * PREVIEW_MODE=true: a private hosted preview (e.g. behind Cloudflare Access) may use the built-in
 * test scheduler and test checkout while real services are being connected. Never set it on the
 * public site.
 */
export function previewMode(): boolean {
  return envBool("PREVIEW_MODE", false);
}

export const config = {
  get siteUrl() {
    return env("SITE_URL", devDefault("http://localhost:3000")).replace(/\/$/, "");
  },
  get tokenSecret() {
    const s = env("TOKEN_SECRET", process.env.NODE_ENV === "production" ? undefined : "dev-only-token-secret-change-me-0000000000");
    if (process.env.NODE_ENV === "production" && s.length < 32) throw new Error("TOKEN_SECRET must be at least 32 characters");
    return s;
  },

  crm: {
    get driver() {
      return env("CRM_DRIVER", devDefault("memory")) as "memory" | "tape";
    },
    get memoryFile() {
      return process.env.MEMORY_STORE_FILE || undefined;
    },
  },

  tape: {
    get baseUrl() {
      return env("TAPE_API_BASE_URL", "https://api.tapeapp.com/v1").replace(/\/$/, "");
    },
    get apiKey() {
      return env("TAPE_API_KEY");
    },
    get authScheme() {
      return env("TAPE_AUTH_SCHEME", "bearer") as "bearer" | "basic";
    },
    get contactsAppId() {
      return env("TAPE_CONTACTS_APP_ID");
    },
    get requestsAppId() {
      return env("TAPE_REQUESTS_APP_ID");
    },
    get mattersAppId() {
      return env("TAPE_MATTERS_APP_ID");
    },
    get tasksAppId() {
      return process.env.TAPE_TASKS_APP_ID || undefined;
    },
    /** Shared secret appended to the Tape webhook URL (?secret=...) configured in Tape. */
    get webhookSecret() {
      return env("TAPE_WEBHOOK_SECRET");
    },
  },

  email: {
    get driver() {
      return env("EMAIL_DRIVER", devDefault("console")) as "console" | "resend";
    },
    get from() {
      return env("EMAIL_FROM", "Tim Berry Consulting <consulting@example.com>");
    },
    get resendApiKey() {
      return env("RESEND_API_KEY");
    },
    get timEmail() {
      return env("TIM_NOTIFY_EMAIL", devDefault("tim@example.com"));
    },
    get staffEmails() {
      return env("STAFF_NOTIFY_EMAILS", devDefault("staff@example.com"))
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    },
  },

  sms: {
    get driver() {
      return env("SMS_DRIVER", devDefault("console")) as "console" | "twilio" | "off";
    },
    get twilioAccountSid() {
      return env("TWILIO_ACCOUNT_SID");
    },
    get twilioAuthToken() {
      return env("TWILIO_AUTH_TOKEN");
    },
    get twilioFrom() {
      return env("TWILIO_FROM_NUMBER");
    },
  },

  scheduling: {
    get driver() {
      const d = env("SCHEDULING_DRIVER", devDefault("mock")) as "mock" | "calendly";
      if (d === "mock" && process.env.NODE_ENV === "production" && !previewMode()) throw new Error("SCHEDULING_DRIVER=mock is not allowed in production");
      return d;
    },
    get calendlyToken() {
      return env("CALENDLY_API_TOKEN");
    },
    /** URI of the ONE event type allowed: "Tim Berry Discovery Call - 15 Minutes". */
    get calendlyEventTypeUri() {
      return env("CALENDLY_DISCOVERY_EVENT_TYPE_URI");
    },
    get calendlyWebhookSigningKey() {
      return env("CALENDLY_WEBHOOK_SIGNING_KEY");
    },
    get callDurationMinutes() {
      return envInt("DISCOVERY_CALL_MINUTES", 15);
    },
  },

  transcripts: {
    get webhookSecret() {
      return env("TRANSCRIPT_WEBHOOK_SECRET");
    },
    get zoomWebhookSecret() {
      return env("ZOOM_WEBHOOK_SECRET_TOKEN");
    },
    /** Hours after the call ends before staff is alerted that no transcript arrived. */
    get overdueHours() {
      return envInt("TRANSCRIPT_OVERDUE_HOURS", 4);
    },
  },

  ai: {
    /** Only enable once the provider is approved for confidential client information. */
    get summaryEnabled() {
      return envBool("AI_SUMMARY_ENABLED", false);
    },
    get model() {
      return env("AI_SUMMARY_MODEL", "claude-opus-5");
    },
  },

  stripe: {
    get secretKey() {
      return env("STRIPE_SECRET_KEY");
    },
    get webhookSecret() {
      return env("STRIPE_WEBHOOK_SECRET");
    },
    get enabled() {
      return Boolean(process.env.STRIPE_SECRET_KEY);
    },
  },

  engagement: {
    /** When true, clients must e-sign the engagement agreement before payment / matter opening. */
    get agreementRequired() {
      return envBool("ENGAGEMENT_AGREEMENT_REQUIRED", true);
    },
    get initialDocumentsRequiredByDefault() {
      return envBool("INITIAL_DOCUMENTS_REQUIRED_DEFAULT", false);
    },
  },

  followUps: {
    get schedulingReminderDays() {
      return envInt("SCHEDULING_REMINDER_DAYS", 3);
    },
    get proposalReminderDays() {
      return envInt("PROPOSAL_REMINDER_DAYS", 3);
    },
  },

  auth: {
    get sessionSecret() {
      return env("SESSION_SECRET", process.env.NODE_ENV === "production" ? undefined : "dev-only-session-secret-change-me-000000000");
    },
    get timPassword() {
      return process.env.TIM_DASHBOARD_PASSWORD || undefined;
    },
    get staffPassword() {
      return process.env.STAFF_DASHBOARD_PASSWORD || undefined;
    },
  },

  get cronSecret() {
    return env("CRON_SECRET", process.env.NODE_ENV === "production" ? undefined : "dev-cron-secret");
  },
};
