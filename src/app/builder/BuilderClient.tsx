"use client";
import { useEffect, useMemo, useState } from "react";
import YAML from "yaml";

type Catalog = Record<string, { kind: string; description: string; tables?: Record<string, string[]>; endpoints?: string[] }>;
type Cond = { kind: "field" | "context"; key: string; op: string; value: string };
type Input = { name: string; type: "string" | "number" | "boolean" | "enum"; values: string };
type Action = { name: string; description: string; inputs: Input[]; can_act: string[]; conds: Cond[]; approvers: string[]; limits: { field: string; min: string; max: string }[]; reason_required: boolean };
type Validation = { ok: boolean; errors: string[]; lint: { action: string; issue: string }[]; exists: boolean; prompt: string; manifest?: { roles_with_access: string[]; actions: Record<string, { can_act: string[]; approvers: string[] }> } };

const OPS = ["gt", "gte", "lt", "lte", "eq", "neq"];
const num = (s: string) => (s.trim() === "" || isNaN(Number(s)) ? s : Number(s));
const val = (s: string) => (s === "true" ? true : s === "false" ? false : num(s));

export function BuilderClient({ catalog, roles }: { catalog: Catalog; roles: string[] }) {
  const [app, setApp] = useState("kyc-queue");
  const [title, setTitle] = useState("KYC review queue");
  const [owner, setOwner] = useState("compliance-ops");
  const [access, setAccess] = useState<string[]>(["kyc_analyst", "auditor"]);
  const [reads, setReads] = useState<Record<string, string[]>>({}); // "res|table" -> cols
  const [readEps, setReadEps] = useState<Record<string, string[]>>({});
  const [writes, setWrites] = useState<{ resource: string; endpoints: string[]; table: string; cols: string[]; via: string }[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [pii, setPii] = useState<Record<string, string[]>>({}); // "table.col" -> roles
  const [raw, setRaw] = useState<string | null>(null);
  const [v, setV] = useState<Validation | null>(null);
  const [scaffoldMsg, setScaffoldMsg] = useState<string | null>(null);
  const [tab, setTab] = useState<"yaml" | "prompt">("yaml");

  const generated = useMemo(() => {
    const r: Record<string, { tables?: Record<string, string[]>; endpoints?: string[] }> = {};
    for (const [k, cols] of Object.entries(reads)) { if (!cols.length) continue; const [res, t] = k.split("|"); r[res] ??= {}; (r[res].tables ??= {})[t] = cols; }
    for (const [res, eps] of Object.entries(readEps)) { if (!eps.length) continue; r[res] ??= {}; r[res].endpoints = eps; }
    const w: Record<string, unknown> = {};
    for (const x of writes) { if (!x.resource) continue; w[x.resource] = { ...(x.endpoints.length ? { endpoints: x.endpoints } : {}), ...(x.table && x.cols.length ? { tables: { [x.table]: x.cols } } : {}), via_actions: x.via.split(",").map((s) => s.trim()).filter(Boolean) }; }
    const a: Record<string, unknown> = {};
    for (const x of actions) {
      if (!x.name) continue;
      a[x.name] = {
        description: x.description,
        input: Object.fromEntries(x.inputs.filter((i) => i.name).map((i) => [i.name, { type: i.type, ...(i.type === "enum" ? { values: i.values.split(",").map((s) => s.trim()).filter(Boolean) } : {}) }])),
        can_act: x.can_act,
        requires_approval_when: x.conds.filter((c) => c.key).map((c) => ({ [c.kind]: c.key, op: c.op, value: val(c.value) })),
        approvers: x.approvers,
        ...(x.limits.some((l) => l.field) ? { limits: Object.fromEntries(x.limits.filter((l) => l.field).map((l) => [l.field, { ...(l.min !== "" ? { min: Number(l.min) } : {}), ...(l.max !== "" ? { max: Number(l.max) } : {}) }])) } : {}),
        reason_required: x.reason_required,
      };
    }
    const p: Record<string, unknown> = {};
    for (const [k, rs] of Object.entries(pii)) if (rs.length) p[k] = { visible_to: rs };
    return YAML.stringify({ app, title, owner, roles_with_access: access, reads: r, writes: w, actions: a, pii: p, denied_by_default: true });
  }, [app, title, owner, access, reads, readEps, writes, actions, pii]);

  const yaml = raw ?? generated;
  useEffect(() => {
    const t = setTimeout(async () => {
      const res = await fetch("/api/builder/validate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ yaml }) });
      setV(await res.json());
    }, 300);
    return () => clearTimeout(t);
  }, [yaml]);

  const toggle = (arr: string[], x: string) => (arr.includes(x) ? arr.filter((y) => y !== x) : [...arr, x]);
  const selectedCols = Object.entries(reads).flatMap(([k, cols]) => cols.map((c) => `${k.split("|")[1]}.${c}`));
  const Roles = ({ value, onChange }: { value: string[]; onChange: (r: string[]) => void }) => (
    <div className="flex flex-wrap gap-1">{roles.map((r) => <button key={r} type="button" onClick={() => onChange(toggle(value, r))} className={value.includes(r) ? "tag-role ring-1 ring-blue-400" : "tag opacity-60"}>{r}</button>)}</div>
  );

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <div className="space-y-4">
        <section className="card space-y-2 text-sm">
          <h2>1. App</h2>
          <div className="grid grid-cols-3 gap-2">
            <label>name<input className="w-full" value={app} onChange={(e) => setApp(e.target.value)} /></label>
            <label>title<input className="w-full" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
            <label>owner<input className="w-full" value={owner} onChange={(e) => setOwner(e.target.value)} /></label>
          </div>
          <div>roles with access <Roles value={access} onChange={setAccess} /></div>
        </section>

        <section className="card space-y-3 text-sm">
          <h2>2. Reads — pick exactly the columns the app needs</h2>
          {Object.entries(catalog).map(([res, r]) => (
            <div key={res} className="rounded border border-neutral-200 p-2">
              <div><span className="tag">{res}</span> <span className="text-xs text-neutral-500">{r.description}</span></div>
              {Object.entries(r.tables ?? {}).map(([t, cols]) => {
                const key = `${res}|${t}`; const sel = reads[key] ?? [];
                return (
                  <div key={t} className="ml-2 mt-1">
                    <b className="text-xs">{t}</b> <button type="button" className="text-xs text-blue-700 underline" onClick={() => setReads({ ...reads, [key]: sel.length === cols.length ? [] : [...cols] })}>{sel.length === cols.length ? "none" : "all"}</button>
                    <div className="flex flex-wrap gap-1">{cols.map((c) => <button type="button" key={c} onClick={() => setReads({ ...reads, [key]: toggle(sel, c) })} className={sel.includes(c) ? "tag ring-1 ring-neutral-900" : "tag opacity-50"}>{c}</button>)}</div>
                  </div>
                );
              })}
              {r.endpoints && <div className="ml-2 mt-1 flex flex-wrap gap-1">{r.endpoints.filter((e) => e.startsWith("GET")).map((e) => <button type="button" key={e} onClick={() => setReadEps({ ...readEps, [res]: toggle(readEps[res] ?? [], e) })} className={(readEps[res] ?? []).includes(e) ? "tag ring-1 ring-neutral-900" : "tag opacity-50"}>{e}</button>)}</div>}
            </div>
          ))}
        </section>

        <section className="card space-y-2 text-sm">
          <h2>3. Writes — only reachable through a named action</h2>
          {writes.map((w, i) => (
            <div key={i} className="rounded border border-neutral-200 p-2 space-y-1">
              <div className="flex gap-2">
                <select value={w.resource} onChange={(e) => setWrites(writes.map((x, j) => j === i ? { ...x, resource: e.target.value, endpoints: [], table: "", cols: [] } : x))}><option value="">resource…</option>{Object.keys(catalog).map((r) => <option key={r}>{r}</option>)}</select>
                <input placeholder="via_actions e.g. kyc.decide, kyc.assign" value={w.via} onChange={(e) => setWrites(writes.map((x, j) => j === i ? { ...x, via: e.target.value } : x))} />
                <button type="button" className="btn" onClick={() => setWrites(writes.filter((_, j) => j !== i))}>remove</button>
              </div>
              {catalog[w.resource]?.endpoints && <div className="flex flex-wrap gap-1">{catalog[w.resource].endpoints!.filter((e) => !e.startsWith("GET")).map((e) => <button type="button" key={e} onClick={() => setWrites(writes.map((x, j) => j === i ? { ...x, endpoints: toggle(x.endpoints, e) } : x))} className={w.endpoints.includes(e) ? "tag ring-1 ring-neutral-900" : "tag opacity-50"}>{e}</button>)}</div>}
              {catalog[w.resource]?.tables && <div className="flex gap-2 items-start">
                <select value={w.table} onChange={(e) => setWrites(writes.map((x, j) => j === i ? { ...x, table: e.target.value, cols: [] } : x))}><option value="">table…</option>{Object.keys(catalog[w.resource].tables!).map((t) => <option key={t}>{t}</option>)}</select>
                <div className="flex flex-wrap gap-1">{(catalog[w.resource].tables![w.table] ?? []).map((c) => <button type="button" key={c} onClick={() => setWrites(writes.map((x, j) => j === i ? { ...x, cols: toggle(x.cols, c) } : x))} className={w.cols.includes(c) ? "tag ring-1 ring-neutral-900" : "tag opacity-50"}>{c}</button>)}</div>
              </div>}
            </div>
          ))}
          <button type="button" className="btn" onClick={() => setWrites([...writes, { resource: "", endpoints: [], table: "", cols: [], via: "" }])}>+ write</button>
        </section>

        <section className="card space-y-2 text-sm">
          <h2>4. Actions — who can act, when it needs approval, hard limits</h2>
          {actions.map((a, i) => {
            const up = (patch: Partial<Action>) => setActions(actions.map((x, j) => j === i ? { ...x, ...patch } : x));
            return (
              <div key={i} className="rounded border border-neutral-200 p-2 space-y-2">
                <div className="flex gap-2"><input placeholder="name e.g. kyc.decide" value={a.name} onChange={(e) => up({ name: e.target.value })} /><input className="flex-1" placeholder="description" value={a.description} onChange={(e) => up({ description: e.target.value })} /><button type="button" className="btn" onClick={() => setActions(actions.filter((_, j) => j !== i))}>remove</button></div>
                <div className="text-xs">inputs {a.inputs.map((inp, k) => (
                  <span key={k} className="mr-2 inline-flex gap-1"><input className="w-28" placeholder="field" value={inp.name} onChange={(e) => up({ inputs: a.inputs.map((x, l) => l === k ? { ...x, name: e.target.value } : x) })} />
                    <select value={inp.type} onChange={(e) => up({ inputs: a.inputs.map((x, l) => l === k ? { ...x, type: e.target.value as Input["type"] } : x) })}>{["string", "number", "boolean", "enum"].map((t) => <option key={t}>{t}</option>)}</select>
                    {inp.type === "enum" && <input className="w-40" placeholder="a, b, c" value={inp.values} onChange={(e) => up({ inputs: a.inputs.map((x, l) => l === k ? { ...x, values: e.target.value } : x) })} />}</span>
                ))}<button type="button" className="text-blue-700 underline" onClick={() => up({ inputs: [...a.inputs, { name: "", type: "string", values: "" }] })}>+ input</button></div>
                <div className="text-xs">can act <Roles value={a.can_act} onChange={(r) => up({ can_act: r })} /></div>
                <div className="text-xs">requires approval when (OR) {a.conds.map((c, k) => (
                  <span key={k} className="mr-2 inline-flex gap-1">
                    <select value={c.kind} onChange={(e) => up({ conds: a.conds.map((x, l) => l === k ? { ...x, kind: e.target.value as Cond["kind"] } : x) })}><option value="field">input</option><option value="context">context</option></select>
                    <input className="w-32" placeholder={c.kind === "field" ? "amount_cents" : "has_open_dispute"} value={c.key} onChange={(e) => up({ conds: a.conds.map((x, l) => l === k ? { ...x, key: e.target.value } : x) })} />
                    <select value={c.op} onChange={(e) => up({ conds: a.conds.map((x, l) => l === k ? { ...x, op: e.target.value } : x) })}>{OPS.map((o) => <option key={o}>{o}</option>)}</select>
                    <input className="w-20" placeholder="value" value={c.value} onChange={(e) => up({ conds: a.conds.map((x, l) => l === k ? { ...x, value: e.target.value } : x) })} />
                  </span>
                ))}<button type="button" className="text-blue-700 underline" onClick={() => up({ conds: [...a.conds, { kind: "field", key: "", op: "gt", value: "" }] })}>+ condition</button></div>
                <div className="text-xs">approvers <Roles value={a.approvers} onChange={(r) => up({ approvers: r })} /></div>
                <div className="text-xs">hard limits {a.limits.map((l, k) => <span key={k} className="mr-2 inline-flex gap-1"><input className="w-28" placeholder="field" value={l.field} onChange={(e) => up({ limits: a.limits.map((x, m) => m === k ? { ...x, field: e.target.value } : x) })} /><input className="w-16" placeholder="min" value={l.min} onChange={(e) => up({ limits: a.limits.map((x, m) => m === k ? { ...x, min: e.target.value } : x) })} /><input className="w-16" placeholder="max" value={l.max} onChange={(e) => up({ limits: a.limits.map((x, m) => m === k ? { ...x, max: e.target.value } : x) })} /></span>)}<button type="button" className="text-blue-700 underline" onClick={() => up({ limits: [...a.limits, { field: "", min: "", max: "" }] })}>+ limit</button></div>
                <label className="text-xs"><input type="checkbox" checked={a.reason_required} onChange={(e) => up({ reason_required: e.target.checked })} /> reason required</label>
              </div>
            );
          })}
          <button type="button" className="btn" onClick={() => setActions([...actions, { name: "", description: "", inputs: [], can_act: [], conds: [], approvers: [], limits: [], reason_required: true }])}>+ action</button>
        </section>

        <section className="card space-y-2 text-sm">
          <h2>5. PII — mask selected columns unless role is listed</h2>
          {selectedCols.length === 0 && <p className="text-xs text-neutral-500">Select read columns first.</p>}
          {selectedCols.map((c) => <div key={c} className="flex items-center gap-2 text-xs"><span className="w-48 font-mono">{c}</span><Roles value={pii[c] ?? []} onChange={(r) => setPii({ ...pii, [c]: r })} /></div>)}
        </section>
      </div>

      <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
        <section className="card space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex gap-2 text-sm"><button type="button" className={tab === "yaml" ? "btn btn-primary" : "btn"} onClick={() => setTab("yaml")}>manifest.yaml</button><button type="button" className={tab === "prompt" ? "btn btn-primary" : "btn"} onClick={() => setTab("prompt")}>Devin prompt</button></div>
            <div className="flex gap-2">
              {raw !== null && <button type="button" className="btn" onClick={() => setRaw(null)}>back to form</button>}
              <button type="button" className="btn" onClick={() => navigator.clipboard.writeText(tab === "yaml" ? yaml : v?.prompt ?? "")}>copy</button>
              <button type="button" className="btn btn-primary" disabled={!v?.ok} title={v?.exists ? "app exists — will overwrite manifest/stubs" : ""} onClick={async () => {
                const r = await fetch("/api/builder/scaffold", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ yaml, force: v?.exists }) });
                const b = await r.json();
                setScaffoldMsg(r.ok ? `Scaffolded: ${b.files.join(", ")}. Open /${b.app} (generic UI works immediately; actions throw TODO until implemented).` : `Error: ${b.error}`);
              }}>{v?.exists ? "re-scaffold" : "scaffold app"}</button>
            </div>
          </div>
          {tab === "yaml" ? (
            <textarea className="h-[28rem] w-full font-mono text-xs" value={yaml} onChange={(e) => setRaw(e.target.value)} spellCheck={false} />
          ) : (
            <pre className="h-[28rem] overflow-auto whitespace-pre-wrap rounded bg-neutral-50 p-2 text-xs">{v?.prompt}</pre>
          )}
          {raw !== null && <p className="text-xs text-amber-700">Editing YAML directly; the form is detached until you go back.</p>}
          {scaffoldMsg && <p className="text-xs">{scaffoldMsg}</p>}
        </section>
        <section className="card space-y-2 text-sm">
          <h2>Validation {v ? (v.ok ? <span className="tag-ok">valid</span> : <span className="tag-deny">{v.errors.length} errors</span>) : null}</h2>
          {v?.errors.map((e, i) => <div key={i} className="text-xs text-red-700">{e}</div>)}
          {v?.lint.map((l, i) => <div key={i} className="text-xs text-amber-700">SoD lint: {l.action}: {l.issue}</div>)}
          {v?.ok && v.manifest && (
            <div className="text-xs text-neutral-600">
              Governance preview: {v.manifest.roles_with_access.length} roles can open the app; {Object.keys(v.manifest.actions).length} actions.
              {Object.entries(v.manifest.actions).map(([n, a]) => <div key={n}><span className="font-mono">{n}</span>: act {a.can_act.join("/") || "nobody"}, approve {a.approvers.join("/") || "n/a"}</div>)}
            </div>
          )}
          {v?.exists && <div className="text-xs text-amber-700">src/apps/{app} already exists.</div>}
        </section>
      </div>
    </div>
  );
}
