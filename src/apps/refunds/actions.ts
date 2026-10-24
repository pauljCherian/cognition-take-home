import type { AppModule } from "@/platform/engine";
import { db } from "@/platform/db";

// App code sees: ctx.http(resource) scoped to this action's manifest entry, and ctx.db for
// context lookups. It never sees a Stripe key or an unscoped connector.
export const actions: AppModule["actions"] = {
  "refund.issue": {
    context(input) {
      const d = db();
      const pay = d.prepare("SELECT customer_id FROM payments WHERE id = ?").get(input.payment_id) as { customer_id: string } | undefined;
      if (!pay) return { prior_refunds_30d: 0, has_open_dispute: false, customer_risk_tier: "unknown" };
      const prior = d.prepare(
        `SELECT COUNT(*) AS c FROM stripe_refunds r JOIN payments p ON p.id = r.charge_id
         WHERE p.customer_id = ? AND r.created_at > datetime('now', '-30 days')`,
      ).get(pay.customer_id) as { c: number };
      const dispute = d.prepare("SELECT 1 FROM disputes WHERE payment_id = ? AND status = 'open'").get(input.payment_id);
      const cust = d.prepare("SELECT risk_tier FROM customers WHERE id = ?").get(pay.customer_id) as { risk_tier: string };
      return { prior_refunds_30d: prior.c, has_open_dispute: !!dispute, customer_risk_tier: cust.risk_tier };
    },
    before(input) {
      return db().prepare("SELECT id, status, amount_cents FROM payments WHERE id = ?").get(input.payment_id);
    },
    execute(ctx, input) {
      const stripe = ctx.http("stripe");
      const charge = stripe("GET", `/v1/charges/${input.payment_id}`) as { amount: number; status: string } | null;
      if (!charge) throw new Error("payment not found");
      if (charge.status === "refunded") throw new Error("payment already refunded");
      if (Number(input.amount_cents) > charge.amount) throw new Error("refund exceeds payment amount");
      return stripe("POST", "/v1/refunds", { charge: input.payment_id, amount: input.amount_cents, reason: input.reason }, { idempotencyKey: ctx.requestId });
    },
  },
};
