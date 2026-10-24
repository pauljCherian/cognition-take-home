"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActionResult, callApi, type ApiResult } from "@/components/ActionResult";

type Row = Record<string, unknown>;
const REASONS = ["duplicate", "fraudulent", "requested_by_customer", "service_issue"];

export function RefundsClient({ payments, customers, disputes, canAct }: { payments: Row[]; customers: Row[]; disputes: Row[]; canAct: boolean }) {
  const router = useRouter();
  const [sel, setSel] = useState<Row | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState(REASONS[2]);
  const [note, setNote] = useState("");
  const [res, setRes] = useState<ApiResult>(null);
  const [busy, setBusy] = useState(false);
  const cust = (id: unknown) => customers.find((c) => c.id === id);
  const disputed = (pid: unknown) => disputes.some((d) => d.payment_id === pid && d.status === "open");

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="card lg:col-span-2">
        <table className="data">
          <thead><tr><th>Payment</th><th>Customer</th><th>Email</th><th>Risk</th><th>Amount</th><th>Card</th><th>Status</th><th>Created</th><th></th></tr></thead>
          <tbody>
            {payments.map((p) => {
              const c = cust(p.customer_id);
              return (
                <tr key={String(p.id)} className={sel?.id === p.id ? "bg-blue-50" : ""}>
                  <td className="font-mono text-xs">{String(p.id)}{disputed(p.id) && <span className="tag-warn ml-1">dispute open</span>}</td>
                  <td className="font-mono text-xs">{String(p.customer_id)}</td>
                  <td className="text-xs">{String(c?.email ?? "")}</td>
                  <td><span className={c?.risk_tier === "high" ? "tag-deny" : "tag"}>{String(c?.risk_tier ?? "")}</span></td>
                  <td>${(Number(p.amount_cents) / 100).toFixed(2)}</td>
                  <td className="font-mono text-xs">•••• {String(p.card_last4)}</td>
                  <td><span className={p.status === "refunded" ? "tag-warn" : "tag-ok"}>{String(p.status)}</span></td>
                  <td className="text-xs text-neutral-500">{String(p.created_at).slice(0, 10)}</td>
                  <td>{canAct && p.status !== "refunded" && <button className="btn" onClick={() => { setSel(p); setAmount((Number(p.amount_cents) / 100).toFixed(2)); setRes(null); }}>Refund…</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="card space-y-3">
        <h2>refund.issue</h2>
        {!canAct && <p className="text-sm text-neutral-500">Your role can view but not act. The button isn&apos;t hidden for show — the API returns 403 too.</p>}
        {sel ? (
          <>
            <div className="text-sm">Payment <span className="font-mono">{String(sel.id)}</span> · max ${(Number(sel.amount_cents) / 100).toFixed(2)}</div>
            <label className="block text-sm">Amount (USD)<input className="mt-1 w-full" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
            <label className="block text-sm">Reason code<select className="mt-1 w-full" value={reason} onChange={(e) => setReason(e.target.value)}>{REASONS.map((r) => <option key={r}>{r}</option>)}</select></label>
            <label className="block text-sm">Note (goes to audit; defaults to reason code)<textarea className="mt-1 w-full" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></label>
            <button className="btn btn-primary" disabled={busy} onClick={async () => {
              setBusy(true);
              const r = await callApi("/api/actions/refunds/refund.issue", { payment_id: sel.id, amount_cents: Math.round(Number(amount) * 100), reason_code: reason, reason: note || reason });
              setRes(r); setBusy(false); router.refresh();
            }}>Submit</button>
            <p className="text-xs text-neutral-500">Policy (from manifest): approval if &gt; $500, ≥2 refunds in 30d, open dispute, or high-risk customer. Hard cap $10,000.</p>
          </>
        ) : <p className="text-sm text-neutral-500">Pick a payment.</p>}
        <ActionResult r={res} />
        <RawCallDemo />
      </div>
    </div>
  );
}

function RawCallDemo() {
  const [res, setRes] = useState<ApiResult>(null);
  return (
    <details className="rounded border border-neutral-200 p-2 text-sm">
      <summary className="cursor-pointer font-medium">Try to bypass the UI</summary>
      <p className="my-2 text-xs text-neutral-600">What a raw API call gets. Every one of these is logged in Governance → Denials.</p>
      <div className="flex flex-wrap gap-2">
        <button className="btn" onClick={async () => setRes(await callApi("/api/resources/refunds/stripe", { method: "POST", path: "/v1/refunds" }))}>POST /v1/refunds directly</button>
        <button className="btn" onClick={async () => setRes(await callApi("/api/query/refunds", { resource: "db.payments", table: "customers", columns: ["id", "ssn_last4"] }))}>read customers.ssn_last4</button>
        <button className="btn" onClick={async () => setRes(await callApi("/api/query/refunds", { resource: "db.payments", table: "payments", columns: ["id", "card_pan"] }))}>read payments.card_pan</button>
        <button className="btn" onClick={async () => setRes(await callApi("/api/actions/refunds/refund.issue", { payment_id: "pay_8f3a", amount_cents: 2000000, reason_code: "duplicate", reason: "bypass test" }, "u_fiona"))}>$20k refund as finance</button>
        <button className="btn" onClick={async () => setRes(await callApi("/api/actions/refunds/refund.issue", { payment_id: "pay_8f3a", amount_cents: 100, reason_code: "duplicate", reason: "bypass test" }, "u_erin"))}>refund as engineer</button>
      </div>
      <div className="mt-2"><ActionResult r={res} /></div>
    </details>
  );
}
