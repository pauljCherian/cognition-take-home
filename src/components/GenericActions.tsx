"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActionResult, callApi, type ApiResult } from "./ActionResult";

type Field = { type: "string" | "number" | "boolean" | "enum"; values?: string[]; required: boolean };
type Spec = { description: string; input: Record<string, Field>; canAct: boolean; reasonRequired: boolean };

export function GenericActions({ app, actions }: { app: string; actions: Record<string, Spec> }) {
  const router = useRouter();
  const [res, setRes] = useState<ApiResult>(null);
  const [vals, setVals] = useState<Record<string, Record<string, string>>>({});
  const set = (a: string, k: string, v: string) => setVals((s) => ({ ...s, [a]: { ...(s[a] ?? {}), [k]: v } }));
  return (
    <div className="space-y-4">
      {Object.entries(actions).map(([name, a]) => (
        <div key={name} className="card space-y-2">
          <h2 className="font-mono text-sm">{name}</h2>
          <p className="text-xs text-neutral-600">{a.description}</p>
          {!a.canAct && <p className="text-xs text-neutral-500">Your role cannot invoke this (the API would 403 too).</p>}
          {Object.entries(a.input).map(([k, f]) => (
            <label key={k} className="block text-xs">{k} <span className="text-neutral-400">{f.type}{f.required ? "" : "?"}</span>
              {f.type === "enum" ? (
                <select className="mt-0.5 w-full" value={vals[name]?.[k] ?? ""} onChange={(e) => set(name, k, e.target.value)}><option value="">—</option>{f.values?.map((v) => <option key={v}>{v}</option>)}</select>
              ) : f.type === "boolean" ? (
                <select className="mt-0.5 w-full" value={vals[name]?.[k] ?? ""} onChange={(e) => set(name, k, e.target.value)}><option value="">—</option><option value="true">true</option><option value="false">false</option></select>
              ) : (
                <input className="mt-0.5 w-full" value={vals[name]?.[k] ?? ""} onChange={(e) => set(name, k, e.target.value)} />
              )}
            </label>
          ))}
          <label className="block text-xs">reason {a.reasonRequired && <span className="text-red-600">*</span>}<input className="mt-0.5 w-full" value={vals[name]?.__reason ?? ""} onChange={(e) => set(name, "__reason", e.target.value)} /></label>
          <button className="btn btn-primary" onClick={async () => {
            const v = vals[name] ?? {};
            const body: Record<string, unknown> = { reason: v.__reason ?? "" };
            for (const [k, f] of Object.entries(a.input)) {
              const raw = v[k];
              if (raw === undefined || raw === "") continue;
              body[k] = f.type === "number" ? Number(raw) : f.type === "boolean" ? raw === "true" : raw;
            }
            setRes(await callApi(`/api/actions/${app}/${name}`, body));
            router.refresh();
          }}>Invoke</button>
        </div>
      ))}
      <ActionResult r={res} />
    </div>
  );
}
