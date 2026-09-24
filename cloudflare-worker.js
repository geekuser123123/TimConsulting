// Cloudflare Worker entry: the OpenNext-built Next.js app plus a Cron Trigger that runs the
// follow-up sweep (reminders, call completion, overdue-transcript alerts, Tape reconcile).
// Built by `npm run cf:build`; see docs/DEPLOY_CLOUDFLARE.md.
import app from "./.open-next/worker.js";

export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";

export default {
  fetch: app.fetch,

  async scheduled(_controller, env, ctx) {
    const base = (env.SITE_URL || "https://localhost").replace(/\/$/, "");
    const request = new Request(`${base}/api/cron/sweep`, { headers: { Authorization: `Bearer ${env.CRON_SECRET}` } });
    ctx.waitUntil(
      app.fetch(request, env, ctx).then(async (res) => {
        if (!res.ok) console.error(`[cron] sweep failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
      }),
    );
  },
};
