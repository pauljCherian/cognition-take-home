import type { Actor } from "@/platform/identity";
import type { Manifest } from "@/platform/manifest";
import { query } from "@/platform/resources";
import { GenericActions } from "./GenericActions";

/** The Page primitive: tables for every declared read table + a form for every declared action.
 *  Zero app-specific UI code; everything is derived from the manifest. */
export function GenericApp({ manifest: m, actor }: { manifest: Manifest; actor: Actor }) {
  if (!m.roles_with_access.includes(actor.role)) {
    return <div className="card text-sm">Role <span className="tag-role">{actor.role}</span> is not in <code>roles_with_access</code> for {m.app}.</div>;
  }
  const tables = Object.entries(m.reads).flatMap(([resource, r]) =>
    Object.entries(r.tables).map(([table, columns]) => ({ resource, table, columns, rows: query(m, actor, { resource, table, columns, limit: 50 }) })),
  );
  const actions = Object.fromEntries(Object.entries(m.actions).map(([n, a]) => [n, { description: a.description, input: a.input, canAct: a.can_act.includes(actor.role), reasonRequired: a.reason_required }]));
  return (
    <>
      <div className="flex items-baseline justify-between"><h1>{m.title}</h1><span className="text-xs text-neutral-500">generic view from src/apps/{m.app}/manifest.yaml</span></div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {tables.map((t) => (
            <div key={t.resource + t.table} className="card overflow-x-auto">
              <h2 className="mb-2"><span className="tag">{t.resource}</span> {t.table} <span className="text-xs font-normal text-neutral-500">{t.rows.length} rows</span></h2>
              <table className="data"><thead><tr>{t.columns.map((c) => <th key={c}>{c}{m.pii[`${t.table}.${c}`] && <span className="tag-warn ml-1">pii</span>}</th>)}</tr></thead>
                <tbody>{t.rows.map((r, i) => <tr key={i}>{t.columns.map((c) => <td key={c} className="font-mono text-xs">{String(r[c] ?? "")}</td>)}</tr>)}</tbody></table>
            </div>
          ))}
        </div>
        <GenericActions app={m.app} actions={actions} />
      </div>
    </>
  );
}
