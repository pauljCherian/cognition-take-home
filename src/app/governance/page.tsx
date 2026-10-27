import { describeCondition, listDenials } from "@/platform/engine";
import { accessReview, columnAccessMatrix, driftFindings, manifestHistory, sodFindings, unreachableColumns } from "@/platform/governance";
import { getActor } from "@/platform/identity";
import { loadManifests } from "@/platform/manifest";
import { RESOURCE_CATALOG } from "@/platform/resources";

export default function GovernancePage() {
  const actor = getActor();
  const manifests = loadManifests();
  const matrix = columnAccessMatrix(manifests);
  const unreachable = unreachableColumns(manifests);
  const review = accessReview(manifests);
  const sod = sodFindings(manifests);
  const drift = driftFindings(manifests);
  const history = manifestHistory(manifests);
  const denials = listDenials(50);
  const visible = ["auditor", "engineer"].includes(actor.role);

  return (
    <>
      <div className="flex items-baseline justify-between">
        <h1>Governance</h1>
        <span className="text-xs text-neutral-500">rendered from src/apps/*/manifest.yaml + runtime tables · nothing here is maintained by hand</span>
      </div>
      {!visible && <div className="rounded border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800">In production this page is limited to <span className="tag-role">auditor</span>/<span className="tag-role">engineer</span>/security. Shown to everyone in the prototype.</div>}

      <section className="card space-y-3">
        <h2 id="apps" className="scroll-mt-4">Per app: what it can read, write, and do</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {manifests.map((m) => (
            <div key={m.app} className="rounded border border-neutral-200 p-3 text-sm">
              <div className="flex items-center justify-between"><b>{m.title}</b><span className="text-xs text-neutral-500">owner {m.owner}</span></div>
              <div className="mt-1 text-xs">access: {m.roles_with_access.map((r) => <span key={r} className="tag-role mr-1">{r}</span>)}</div>
              <div className="mt-2 font-semibold text-xs uppercase text-neutral-500">Reads</div>
              {Object.entries(m.reads).map(([res, r]) => (
                <div key={res} className="ml-2">
                  <span className="tag">{res}</span>
                  {Object.entries(r.tables).map(([t, cols]) => <div key={t} className="ml-3 text-xs"><b>{t}</b>: {cols.map((c) => <span key={c} className={m.pii[`${t}.${c}`] ? "tag-warn mr-1" : "mr-1 font-mono"}>{c}</span>)}</div>)}
                  {r.endpoints.map((e) => <div key={e} className="ml-3 font-mono text-xs">{e}</div>)}
                </div>
              ))}
              <div className="mt-2 font-semibold text-xs uppercase text-neutral-500">Writes</div>
              {Object.entries(m.writes).length === 0 && <div className="ml-2 text-xs text-neutral-500">none</div>}
              {Object.entries(m.writes).map(([res, w]) => (
                <div key={res} className="ml-2 text-xs"><span className="tag">{res}</span> {w.endpoints.map((e) => <span key={e} className="mr-1 font-mono">{e}</span>)}{Object.entries(w.tables).map(([t, cols]) => <span key={t} className="font-mono">{t}[{cols.join(", ")}]</span>)} <span className="text-neutral-500">only via</span> {w.via_actions.map((v) => <span key={v} className="tag mr-1">{v}</span>)}</div>
              ))}
              <div className="mt-2 font-semibold text-xs uppercase text-neutral-500">Actions</div>
              <table className="data mt-1"><thead><tr><th>Action</th><th>Can act</th><th>Approval when</th><th>Approvers</th><th>Hard limits</th></tr></thead>
                <tbody>{Object.entries(m.actions).map(([name, a]) => (
                  <tr key={name}>
                    <td className="font-mono text-xs">{name}</td>
                    <td>{a.can_act.map((r) => <span key={r} className="tag-role mr-1">{r}</span>)}</td>
                    <td className="font-mono text-xs">{a.requires_approval_when.length ? a.requires_approval_when.map(describeCondition).join(" OR ") : "never"}</td>
                    <td>{a.approvers.map((r) => <span key={r} className="tag-role mr-1">{r}</span>)}</td>
                    <td className="font-mono text-xs">{Object.entries(a.limits).map(([f, l]) => `${f} ${l.min ?? ""}..${l.max ?? ""}`).join(", ") || "—"}</td>
                  </tr>
                ))}</tbody></table>
              {Object.keys(m.pii).length > 0 && <div className="mt-2 text-xs"><span className="font-semibold uppercase text-neutral-500">PII</span> {Object.entries(m.pii).map(([f, p]) => <span key={f} className="ml-2"><span className="tag-warn">{f}</span> unmasked for {p.visible_to.map((r) => <span key={r} className="tag-role ml-1">{r}</span>)}</span>)}</div>}
            </div>
          ))}
        </div>
      </section>

      <section className="card space-y-2">
        <h2 id="columns" className="scroll-mt-4">Per column (inverted): who can read this field?</h2>
        <p className="text-xs text-neutral-500">The access-review question. Columns in the catalog that no app can reach are listed underneath — that is where the sensitive fields should be.</p>
        <table className="data"><thead><tr><th>Resource</th><th>Table.column</th><th>Readable by</th></tr></thead>
          <tbody>{matrix.map((c) => (
            <tr key={`${c.resource}.${c.table}.${c.column}`}>
              <td><span className="tag">{c.resource}</span></td>
              <td className="font-mono text-xs">{c.table}.{c.column} {c.pii && <span className="tag-warn">pii</span>}</td>
              <td className="text-xs">{c.readers.map((r) => <span key={r.app} className="mr-3"><span className="tag">{r.app}</span> → {r.roles.map((x) => <span key={x} className="tag-role mr-1">{x}</span>)}</span>)}</td>
            </tr>
          ))}</tbody></table>
        <div className="text-xs"><b>Unreachable by any app:</b> {unreachable.map((u) => <span key={u} className="tag-ok mr-1">{u}</span>)}</div>
      </section>

      <section className="card space-y-2">
        <h2 id="users" className="scroll-mt-4">Per user: effective permissions (quarterly access review export)</h2>
        <table className="data"><thead><tr><th>User</th><th>Role (from IdP)</th><th>Apps</th><th>Can act</th><th>Can approve</th><th>Can unmask</th></tr></thead>
          <tbody>{review.map((r) => (
            <tr key={r.user.id}>
              <td className="text-xs">{r.user.name}</td>
              <td><span className="tag-role">{r.user.role}</span></td>
              <td className="text-xs">{r.apps.join(", ") || "—"}</td>
              <td className="font-mono text-xs">{r.actions.filter((a) => a.canAct).map((a) => a.action).join(", ") || "—"}</td>
              <td className="font-mono text-xs">{r.actions.filter((a) => a.canApprove).map((a) => a.action).join(", ") || "—"}</td>
              <td className="font-mono text-xs">{r.unmask.join(", ") || "—"}</td>
            </tr>
          ))}</tbody></table>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card space-y-2">
          <h2 id="sod" className="scroll-mt-4">Segregation-of-duties lint</h2>
          {sod.length === 0 ? <div className="tag-ok">no findings</div> : sod.map((f, i) => <div key={i} className="text-xs"><span className="tag">{f.app}</span> <span className="font-mono">{f.action}</span>: {f.issue}</div>)}
        </div>
        <div className="card space-y-2">
          <h2 id="drift" className="scroll-mt-4">Drift: manifest vs resource catalog</h2>
          {drift.length === 0 ? <div className="tag-ok">every declared table/column/endpoint exists in the catalog</div> : drift.map((f, i) => <div key={i} className="text-xs"><span className="tag">{f.app}</span> {f.issue}</div>)}
          <p className="text-xs text-neutral-500">In prod this also compares against live DB grants and the HTTP proxy allowlist.</p>
        </div>
      </section>

      <section className="card space-y-2">
        <h2 id="denials" className="scroll-mt-4">Denied attempts (live)</h2>
        <p className="text-xs text-neutral-500">Out-of-scope reads, direct connector writes, wrong role, over-limit, self-approval. Proof the enforcement is real.</p>
        <table className="data"><thead><tr><th>At</th><th>App</th><th>Actor</th><th>Kind</th><th>Detail</th></tr></thead>
          <tbody>{denials.map((d) => (
            <tr key={d.id}><td className="whitespace-nowrap text-xs">{d.ts.slice(0, 19).replace("T", " ")}</td><td><span className="tag">{d.app}</span></td><td className="text-xs">{d.actor_id} <span className="tag-role">{d.actor_role}</span></td><td><span className="tag-deny">{d.kind}</span></td><td className="text-xs">{d.detail}</td></tr>
          ))}{denials.length === 0 && <tr><td colSpan={5} className="text-sm text-neutral-500">None yet. Use &quot;Try to bypass the UI&quot; on the refunds page.</td></tr>}</tbody></table>
      </section>

      <section className="card space-y-2">
        <h2 id="changes" className="scroll-mt-4">Manifest change log</h2>
        <p className="text-xs text-neutral-500">From git. In production a manifest diff is a PR that requires the resource owner and security as reviewers; UI changes do not.</p>
        {history.length === 0 ? <div className="text-sm text-neutral-500">No commits yet.</div> : (
          <table className="data"><thead><tr><th>App</th><th>Commit</th><th>Author</th><th>Date</th><th>Subject</th></tr></thead>
            <tbody>{history.map((h) => <tr key={h.app + h.sha}><td><span className="tag">{h.app}</span></td><td className="font-mono text-xs">{h.sha}</td><td className="text-xs">{h.author}</td><td className="text-xs">{h.date}</td><td className="text-xs">{h.subject}</td></tr>)}</tbody></table>
        )}
      </section>

      <section className="card space-y-2">
        <h2 id="catalog" className="scroll-mt-4">Resource catalog</h2>
        <p className="text-xs text-neutral-500">What the platform team has connected. Apps may only declare subsets of this.</p>
        {Object.entries(RESOURCE_CATALOG).map(([name, r]) => (
          <div key={name} className="text-xs"><span className="tag">{name}</span> <span className="text-neutral-500">{r.description}</span>
            <div className="ml-4 font-mono">{Object.entries(r.tables ?? {}).map(([t, c]) => <div key={t}>{t}: {c.join(", ")}</div>)}{r.endpoints?.join(" · ")}</div>
          </div>
        ))}
      </section>
    </>
  );
}
