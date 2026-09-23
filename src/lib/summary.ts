/**
 * Structured post-call summary from the discovery call transcript.
 *
 * The result is an INTERNAL DRAFT for staff and Tim — never final attorney analysis, and never
 * sent to the client. Only enable (AI_SUMMARY_ENABLED=true) once the provider/account is approved
 * for confidential client information (e.g. appropriate data-retention terms in place).
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { config } from "./config";
import type { ConsultingRequest } from "./domain";

export const SummarySchema = z.object({
  clientGoal: z.string().describe("What the client is ultimately trying to accomplish."),
  currentSituation: z.string().describe("What exists today."),
  primaryIssue: z.string().describe("The main problem Tim identified."),
  secondaryIssues: z.string().describe("Other issues that may affect the work. Empty string if none."),
  relevantFacts: z.string().describe("Important facts stated during the call, as a bulleted list."),
  factsDocumentsStillNeeded: z.string().describe("What must be obtained before work begins, as a bulleted list."),
  attorneyWorkRequired: z.enum(["Yes", "No", "Unclear"]),
  recommendedWork: z.string().describe("Short internal description of the recommended work."),
  recommendedDeliverable: z.string().describe("What the client would receive."),
});
export type CallSummary = z.infer<typeof SummarySchema>;

const SYSTEM_PROMPT = `You prepare internal intake summaries for a law and tax consulting practice led by attorney Tim Berry. Staff use your summary to draft a proposed scope of work; Tim reviews it before anything reaches the client.

You will receive the client's written intake answers and the transcript of a short discovery call between Tim and the client. Summarize what was actually said. Where Tim stated a view about the issue, the work required, or the deliverable, reflect Tim's view rather than your own. If something was not discussed, say so plainly rather than inferring it; use "Unclear" for attorney work required when Tim did not indicate it. Do not give legal or tax conclusions of your own. Write plainly and concisely for a busy attorney. Never repeat Social Security numbers, full account numbers, or passwords even if they appear in the transcript.`;

let client: Anthropic | undefined;
function getClient() {
  client ??= new Anthropic();
  return client;
}

export class SummaryUnavailableError extends Error {}

export async function generateCallSummary(req: ConsultingRequest, transcript: string): Promise<CallSummary> {
  const intake = [
    `Main reason for the call: ${req.mainReason}`,
    `Trying to accomplish: ${req.clientGoal}`,
    `Currently unsure about: ${req.clientQuestion}`,
    `Specific transaction: ${req.specificTransaction ? `Yes — ${req.transactionSummary ?? ""}` : "No"}`,
    `Timing/deadline: ${req.timingDeadline ?? ""}`,
    `Account/plan type: ${req.accountType ?? ""}`,
    `Related entities: ${req.relatedEntities ?? ""}`,
    `Related parties: ${req.relatedParties ?? ""}`,
    `State: ${req.state}`,
  ].join("\n");

  const response = await getClient().beta.messages.parse({
    model: config.ai.model,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `<intake_form>\n${intake}\n</intake_form>\n\n<transcript>\n${transcript}\n</transcript>\n\nPrepare the internal summary.`,
      },
    ],
    output_config: { format: betaZodOutputFormat(SummarySchema) },
  });

  if (response.stop_reason === "refusal") throw new SummaryUnavailableError("The model declined to summarize this transcript");
  if (response.stop_reason === "max_tokens") throw new SummaryUnavailableError("Summary was cut off (max_tokens)");
  if (!response.parsed_output) throw new SummaryUnavailableError("Summary could not be parsed");
  return response.parsed_output;
}
