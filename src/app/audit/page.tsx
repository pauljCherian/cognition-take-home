import { listAudit } from "@/platform/engine";

export default function AuditPage() {
  const rows = listAudit(200);
  return (
    <>
      <div className="flex items-baseline justify-between">
        <h1>Audit log</h1>
        <span className="text-xs text-neutral-500">append-only (DB triggers reject UPDATE/DELETE) · written in the same transaction as the mutation</span>
      </div>
      <div className="card overflow-x-auto">
        <table className="data">
          <thead><tr><th>#</th><th>At</th><th>App</th><th>Actor</th><th>Event</th><th>Action / request</th><th>Before</th><th>After</th><th>Reason</th><th>Detail</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="text-xs text-neutral-400">{r.id}</td>
                <td className="whitespace-nowrap text-xs">{r.ts.slice(0, 19).replace("T", " ")}</td>
                <td><span className="tag">{r.app}</span></td>
                <td className="text-xs">{r.actor_id} <span className="tag-role">{r.actor_role}</span></td>
                <td><span className={r.event.endsWith("executed") ? "tag-ok" : r.event.endsWith("rejected") ? "tag-deny" : "tag-warn"}>{r.event}</span></td>
                <td className="font-mono text-xs">{r.action}<br /><span className="text-neutral-400">{r.request_id}</span></td>
                <td className="max-w-xs break-all font-mono text-xs text-neutral-500">{r.before_json}</td>
                <td className="max-w-xs break-all font-mono text-xs">{r.after_json}</td>
                <td className="text-xs">{r.reason}</td>
                <td className="text-xs text-neutral-600">{r.detail}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={10} className="text-sm text-neutral-500">Nothing yet. Issue a refund or flip a flag.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
