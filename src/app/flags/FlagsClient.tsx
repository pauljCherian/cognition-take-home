"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActionResult, callApi, type ApiResult } from "@/components/ActionResult";

type Row = Record<string, unknown>;

export function FlagsClient({ flags, canAct }: { flags: Row[]; canAct: boolean }) {
  const router = useRouter();
  const [res, setRes] = useState<ApiResult>(null);
  const [reason, setReason] = useState("");
  const keys = Array.from(new Set(flags.map((f) => String(f.key))));
  const envs = ["dev", "staging", "prod"];
  const get = (k: string, e: string) => flags.find((f) => f.key === k && f.environment === e);

  async function set(k: string, e: string, enabled: boolean, pct: number) {
    setRes(await callApi("/api/actions/flags/flag.set", { key: k, environment: e, enabled, rollout_pct: pct, reason }));
    router.refresh();
  }
  return (
    <div className="space-y-3">
      <div className="card flex items-center gap-3 text-sm">
        <label className="flex-1">Reason for change (required, audited)<input className="ml-2 w-2/3" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. INC-412 rollback" /></label>
      </div>
      <div className="card">
        <table className="data">
          <thead><tr><th>Flag</th>{envs.map((e) => <th key={e}>{e}{e === "prod" && <span className="tag-warn ml-1">approval</span>}</th>)}<th></th></tr></thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k}>
                <td><div className="font-mono text-xs">{k}</div><div className="text-xs text-neutral-500">{String(get(k, "dev")?.description ?? "")}</div></td>
                {envs.map((e) => {
                  const f = get(k, e);
                  const on = Number(f?.enabled) === 1;
                  return (
                    <td key={e}>
                      <span className={on ? "tag-ok" : "tag"}>{on ? `on ${f?.rollout_pct}%` : "off"}</span>
                      {canAct && <div className="mt-1 flex gap-1">
                        <button className="btn" onClick={() => set(k, e, !on, on ? 0 : 100)}>{on ? "turn off" : "turn on"}</button>
                        {on && <button className="btn" onClick={() => set(k, e, true, Math.min(100, Number(f?.rollout_pct) + 25))}>+25%</button>}
                      </div>}
                    </td>
                  );
                })}
                <td>{canAct && <button className="btn btn-danger" onClick={async () => { setRes(await callApi("/api/actions/flags/flag.kill", { key: k, reason })); router.refresh(); }}>Kill</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ActionResult r={res} />
    </div>
  );
}
