"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActionResult, callApi, type ApiResult } from "@/components/ActionResult";

type Req = { id: string; app: string; action: string; requester_id: string; requester_role: string; input_json: string; reason: string; status: string; created_at: string; decided_by: string | null; decision_reason: string | null };

export function ApprovalsClient({ requests, actorId, approverFor }: { requests: Req[]; actorId: string; approverFor: Record<string, boolean> }) {
  const router = useRouter();
  const [res, setRes] = useState<ApiResult>(null);
  const [note, setNote] = useState("");
  const pending = requests.filter((r) => r.status === "pending");
  const done = requests.filter((r) => r.status !== "pending");
  async function act(id: string, decision: "approve" | "reject") {
    setRes(await callApi(`/api/approvals/${id}`, { decision, reason: note }));
    router.refresh();
  }
  const Row = ({ r }: { r: Req }) => {
    const mine = r.requester_id === actorId;
    const key = `${r.app}:${r.action}`;
    return (
      <tr>
        <td className="font-mono text-xs">{r.id}</td>
        <td><span className="tag">{r.app}</span> <span className="tag">{r.action}</span></td>
        <td className="text-xs">{r.requester_id} <span className="tag-role">{r.requester_role}</span></td>
        <td className="font-mono text-xs">{r.input_json}</td>
        <td className="text-xs">{r.reason}</td>
        <td className="text-xs text-neutral-500">{r.created_at.slice(0, 19).replace("T", " ")}</td>
        <td>
          {r.status === "pending" ? (
            <div className="flex gap-1">
              <button className="btn btn-primary" onClick={() => act(r.id, "approve")} title={mine ? "You requested this — the server will refuse (self-approval)" : !approverFor[key] ? "Your role is not an approver — the server will refuse" : ""}>Approve</button>
              <button className="btn" onClick={() => act(r.id, "reject")}>Reject</button>
            </div>
          ) : <span className={r.status === "executed" ? "tag-ok" : "tag-deny"}>{r.status} by {r.decided_by}</span>}
        </td>
      </tr>
    );
  };
  return (
    <div className="space-y-4">
      <div className="card space-y-2">
        <h2>Pending ({pending.length})</h2>
        <p className="text-xs text-neutral-500">Buttons are shown to everyone on purpose: approve as the requester or as the wrong role and watch the server 403 and log a denial.</p>
        <label className="block text-sm">Decision note<input className="ml-2 w-1/2" value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <table className="data"><thead><tr><th>Request</th><th>Action</th><th>Requester</th><th>Frozen input</th><th>Reason</th><th>At</th><th></th></tr></thead><tbody>{pending.map((r) => <Row key={r.id} r={r} />)}</tbody></table>
        <ActionResult r={res} />
      </div>
      <div className="card">
        <h2>History</h2>
        <table className="data"><thead><tr><th>Request</th><th>Action</th><th>Requester</th><th>Input</th><th>Reason</th><th>At</th><th>Outcome</th></tr></thead><tbody>{done.map((r) => <Row key={r.id} r={r} />)}</tbody></table>
      </div>
    </div>
  );
}
