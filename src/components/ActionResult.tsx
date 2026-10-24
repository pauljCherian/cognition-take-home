"use client";
export type ApiResult = { ok: boolean; status: number; body: Record<string, unknown> } | null;

export function ActionResult({ r }: { r: ApiResult }) {
  if (!r) return null;
  const b = r.body;
  if (r.status === 403) return <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-800"><b>403 denied</b> ({String(b.kind)}): {String(b.error)} — logged to denials.</div>;
  if (r.status === 202) return <div className="rounded border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800"><b>Pending approval</b> ({String(b.requestId)}). Matched: {(b.matched as string[]).join(" OR ")}. Audit row written.</div>;
  if (r.ok) return <div className="rounded border border-green-200 bg-green-50 p-2 text-sm text-green-800"><b>Executed</b> ({String(b.requestId ?? "")}) <code className="text-xs">{JSON.stringify(b.result)}</code></div>;
  return <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-800"><b>Error</b>: {String(b.error)}</div>;
}

export async function callApi(url: string, body: unknown, actorHeader?: string): Promise<ApiResult> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...(actorHeader ? { "x-actor": actorHeader } : {}) }, body: JSON.stringify(body) });
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => ({})) };
}
