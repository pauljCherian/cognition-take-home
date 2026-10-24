import { getActor } from "@/platform/identity";
import { getManifest } from "@/platform/manifest";
import { query } from "@/platform/resources";
import { RefundsClient } from "./RefundsClient";

export default function RefundsPage() {
  const actor = getActor();
  const m = getManifest("refunds");
  if (!m.roles_with_access.includes(actor.role)) {
    return <div className="card text-sm">Role <span className="tag-role">{actor.role}</span> is not in <code>roles_with_access</code> for refunds.</div>;
  }
  // These reads are checked against manifest.reads; remove a column from the manifest and the page fails closed.
  const payments = query(m, actor, { resource: "db.payments", table: "payments", columns: ["id", "customer_id", "amount_cents", "currency", "card_last4", "status", "created_at"], orderBy: "created_at desc" });
  const customers = query(m, actor, { resource: "db.payments", table: "customers", columns: ["id", "email", "risk_tier"] });
  const disputes = query(m, actor, { resource: "db.payments", table: "disputes", columns: ["id", "payment_id", "status", "opened_at"] });
  const canAct = m.actions["refund.issue"].can_act.includes(actor.role);
  return (
    <>
      <div className="flex items-baseline justify-between">
        <h1>{m.title}</h1>
        <span className="text-xs text-neutral-500">manifest: src/apps/refunds/manifest.yaml · email {m.pii["customers.email"].visible_to.includes(actor.role) ? "unmasked" : "masked"} for {actor.role}</span>
      </div>
      <RefundsClient payments={payments} customers={customers} disputes={disputes} canAct={canAct} />
    </>
  );
}
