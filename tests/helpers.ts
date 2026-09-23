import { MemoryStore } from "@/lib/store/memory";
import { setStore } from "@/lib/store";
import { outbox } from "@/lib/notify";
import { setPaymentGateway, type PaymentGateway } from "@/lib/payments";
import { intakeSchema, type IntakeInput } from "@/lib/intake-schema";
import { submitRequest } from "@/lib/workflow/intake";

export class FakeGateway implements PaymentGateway {
  created: { requestId: string; amount: number }[] = [];
  async createCheckout(req: Parameters<PaymentGateway["createCheckout"]>[0]) {
    this.created.push({ requestId: req.id, amount: req.feeAmount ?? 0 });
    const id = `cs_test_${this.created.length}`;
    return { id, url: `https://checkout.stripe.test/${id}`, expiresAt: new Date(Date.now() + 23 * 3600e3).toISOString(), customerId: "cus_test_1" };
  }
}

export function freshEnv() {
  const store = new MemoryStore();
  setStore(store);
  const gateway = new FakeGateway();
  setPaymentGateway(gateway);
  outbox().length = 0;
  return { store, gateway };
}

export const baseIntake: IntakeInput = {
  firstName: "Jane",
  lastName: "Doe",
  email: "Jane.Doe@example.com",
  phone: "(555) 123-4567",
  state: "Texas",
  currentClient: "no",
  academyClient: "yes",
  mainReason: "Self-directed IRA investment question",
  clientGoal: "Buy a rental property with my self-directed IRA",
  clientQuestion: "Whether my LLC structure creates a prohibited transaction",
  specificTransaction: "yes",
  transactionSummary: "Closing on a duplex in 45 days",
  timingDeadline: "45 days",
  accountType: "Self-directed IRA",
  relatedEntities: "Doe Holdings LLC",
  relatedParties: "My brother (property manager)",
  heardAbout: "IRA Ideas newsletter",
  recordingConsent: "yes",
  acknowledgeNoRelationship: true,
};

export async function submit(overrides: Partial<IntakeInput> = {}) {
  return submitRequest(intakeSchema.parse({ ...baseIntake, ...overrides }));
}

export function emailsTo(address: string) {
  return outbox().filter((m) => m.channel === "email" && m.to.toLowerCase() === address.toLowerCase());
}

export function extractLink(body: string, pathPart: string): string {
  const m = body.match(new RegExp(`https?://\\S*${pathPart}\\S*`));
  if (!m) throw new Error(`No ${pathPart} link in message`);
  return m[0];
}
