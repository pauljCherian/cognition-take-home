import { z } from "zod";
import { db, newId, nowIso } from "./db";
import { DeniedError } from "./errors";
import type { Actor } from "./identity";
import type { ActionSpec, Condition, Manifest } from "./manifest";
import { getManifest } from "./manifest";
import { logDenial, scopedHttp, type HttpWriter } from "./resources";

export type ActionCtx = {
  actor: Actor;
  requestId: string;
  /** free-text reason supplied by the requester (or the approver's note) */
  reason: string;
  http: (resource: string) => HttpWriter;
  db: ReturnType<typeof db>;
};

export type ActionImpl = {
  /** Extra facts the policy may reference (e.g. prior_refunds_30d). Runs before policy. */
  context?: (input: Record<string, unknown>) => Record<string, unknown>;
  /** Snapshot of state before the write, for the audit row. */
  before?: (input: Record<string, unknown>) => unknown;
  execute: (ctx: ActionCtx, input: Record<string, unknown>) => unknown;
};

export type AppModule = { actions: Record<string, ActionImpl> };

/** Apps are discovered by convention: src/apps/<app>/actions.ts. No registry to edit. */
async function loadModule(appId: string): Promise<AppModule> {
  try {
    return (await import(`../apps/${appId}/actions`)) as AppModule;
  } catch (e) {
    throw new Error(`app "${appId}" has a manifest but no src/apps/${appId}/actions.ts (${e instanceof Error ? e.message : e})`);
  }
}

function inputSchema(spec: ActionSpec) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [k, f] of Object.entries(spec.input)) {
    let s: z.ZodTypeAny =
      f.type === "number" ? z.coerce.number() :
      f.type === "boolean" ? z.coerce.boolean() :
      f.type === "enum" ? z.enum(f.values as [string, ...string[]]) : z.string().min(1);
    if (!f.required) s = s.optional();
    shape[k] = s;
  }
  return z.object(shape).strict();
}

function evalCondition(c: Condition, facts: Record<string, unknown>): boolean {
  const key = c.field ?? c.context ?? "";
  const v = facts[key];
  switch (c.op) {
    case "gt": return Number(v) > Number(c.value);
    case "gte": return Number(v) >= Number(c.value);
    case "lt": return Number(v) < Number(c.value);
    case "lte": return Number(v) <= Number(c.value);
    case "eq": return v === c.value;
    case "neq": return v !== c.value;
    case "in": return Array.isArray(c.value) && (c.value as unknown[]).includes(v as never);
  }
}

export function describeCondition(c: Condition) {
  const sym: Record<string, string> = { gt: ">", gte: ">=", lt: "<", lte: "<=", eq: "==", neq: "!=", in: "in" };
  return `${c.field ?? c.context} ${sym[c.op]} ${JSON.stringify(c.value)}`;
}

function audit(app: string, actor: Actor, event: string, extra: Partial<{ action: string; request_id: string; before: unknown; after: unknown; reason: string; detail: string }>) {
  db().prepare(
    "INSERT INTO audit_log (ts, app, actor_id, actor_role, event, action, request_id, before_json, after_json, reason, detail) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
  ).run(
    nowIso(), app, actor.id, actor.role, event, extra.action ?? null, extra.request_id ?? null,
    extra.before === undefined ? null : JSON.stringify(extra.before),
    extra.after === undefined ? null : JSON.stringify(extra.after),
    extra.reason ?? null, extra.detail ?? null,
  );
}

export type InvokeResult =
  | { status: "executed"; requestId: string; result: unknown }
  | { status: "pending"; requestId: string; matched: string[] };

/** The core primitive: every write in every app goes through here. */
export async function invoke(appId: string, actionName: string, actor: Actor, rawInput: unknown, reason: string): Promise<InvokeResult> {
  const manifest = getManifest(appId);
  const spec = manifest.actions[actionName];
  const deny = (kind: DeniedError["kind"], msg: string): never => {
    logDenial(appId, actor, kind, `${actionName}: ${msg}`);
    throw new DeniedError(kind, msg);
  };
  if (!spec) deny("write_scope", `action ${actionName} is not declared in ${appId}'s manifest`);

  // 1. role
  if (!spec.can_act.includes(actor.role)) deny("role", `role ${actor.role} may not invoke ${actionName}`);
  // 2. input shape + reason
  const parsed = inputSchema(spec).safeParse(rawInput);
  if (!parsed.success) deny("input", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const input = parsed.data as Record<string, unknown>;
  if (spec.reason_required && !reason?.trim()) deny("input", "reason is required");
  // 3. hard limits — no approval can exceed these
  for (const [field, lim] of Object.entries(spec.limits)) {
    const v = Number(input[field]);
    if (lim.max !== undefined && v > lim.max) deny("limit", `${field}=${v} exceeds hard limit ${lim.max}`);
    if (lim.min !== undefined && v < lim.min) deny("limit", `${field}=${v} below hard limit ${lim.min}`);
  }
  // 4. approval predicate
  const mod = await loadModule(appId);
  const impl = mod.actions[actionName];
  if (!impl) throw new Error(`${appId} declares ${actionName} but has no implementation`);
  const facts = { ...input, ...(impl.context?.(input) ?? {}) };
  const matched = spec.requires_approval_when.filter((c) => evalCondition(c, facts)).map(describeCondition);

  const requestId = newId("req");
  const d = db();
  if (matched.length > 0) {
    // validate domain state now, not only when the approver clicks: a request for an already-decided
    // case should be refused at submit time, not sit in the inbox
    impl.before?.(input);
    d.transaction(() => {
      d.prepare(
        "INSERT INTO action_requests (id, app, action, requester_id, requester_role, input_json, reason, status, policy, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
      ).run(requestId, appId, actionName, actor.id, actor.role, JSON.stringify(input), reason, "pending", "requires_approval", nowIso());
      audit(appId, actor, "action.requested", { action: actionName, request_id: requestId, after: input, reason, detail: `approval required: ${matched.join(" OR ")}` });
    })();
    return { status: "pending", requestId, matched };
  }

  const result = executeAndRecord(manifest, actor, actionName, impl, input, reason, requestId, "allow");
  return { status: "executed", requestId, result };
}

function executeAndRecord(manifest: Manifest, actor: Actor, actionName: string, impl: ActionImpl, input: Record<string, unknown>, reason: string, requestId: string, policy: "allow" | "requires_approval", requester?: Actor) {
  const d = db();
  // Mutation + audit row commit together or not at all.
  return d.transaction(() => {
    const before = impl.before?.(input);
    const ctx: ActionCtx = {
      actor, requestId, reason, db: d,
      http: (resource) => scopedHttp(manifest, actor, resource, actionName),
    };
    const result = impl.execute(ctx, input);
    if (policy === "allow") {
      d.prepare(
        "INSERT INTO action_requests (id, app, action, requester_id, requester_role, input_json, reason, status, policy, result_json, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      ).run(requestId, manifest.app, actionName, actor.id, actor.role, JSON.stringify(input), reason, "executed", policy, JSON.stringify(result ?? null), nowIso());
    } else {
      d.prepare("UPDATE action_requests SET status='executed', decided_by=?, decided_at=?, result_json=? WHERE id=?")
        .run(actor.id, nowIso(), JSON.stringify(result ?? null), requestId);
    }
    audit(manifest.app, actor, "action.executed", {
      action: actionName, request_id: requestId, before, after: result ?? input, reason,
      detail: requester ? `approved; requested by ${requester.id}` : "policy: allow",
    });
    return result;
  })();
}

export async function decide(requestId: string, approver: Actor, decision: "approve" | "reject", decisionReason: string) {
  const d = db();
  const req = d.prepare("SELECT * FROM action_requests WHERE id = ?").get(requestId) as
    | { id: string; app: string; action: string; requester_id: string; requester_role: string; input_json: string; reason: string; status: string }
    | undefined;
  if (!req) throw new DeniedError("state", "no such request");
  const manifest = getManifest(req.app);
  const spec = manifest.actions[req.action];
  const deny = (kind: DeniedError["kind"], msg: string): never => {
    logDenial(req.app, approver, kind, `${req.action} ${requestId}: ${msg}`);
    throw new DeniedError(kind, msg);
  };
  if (req.status !== "pending") deny("state", `request is ${req.status}`);
  if (!spec.approvers.includes(approver.role)) deny("role", `role ${approver.role} may not approve ${req.action}`);
  if (req.requester_id === approver.id) deny("self_approval", "requester may not approve their own request");

  if (decision === "reject") {
    d.transaction(() => {
      d.prepare("UPDATE action_requests SET status='rejected', decided_by=?, decided_at=?, decision_reason=? WHERE id=?")
        .run(approver.id, nowIso(), decisionReason, requestId);
      audit(req.app, approver, "action.rejected", { action: req.action, request_id: requestId, reason: decisionReason, detail: `requested by ${req.requester_id}` });
    })();
    return { status: "rejected" as const, requestId };
  }
  const mod = await loadModule(req.app);
  const impl = mod.actions[req.action];
  const requester: Actor = { id: req.requester_id, name: req.requester_id, role: req.requester_role as Actor["role"] };
  const result = executeAndRecord(manifest, approver, req.action, impl, JSON.parse(req.input_json), decisionReason || req.reason, requestId, "requires_approval", requester);
  return { status: "executed" as const, requestId, result };
}

export function listRequests(filter?: { status?: string }) {
  const sql = "SELECT * FROM action_requests" + (filter?.status ? " WHERE status = ?" : "") + " ORDER BY created_at DESC LIMIT 100";
  return db().prepare(sql).all(...(filter?.status ? [filter.status] : [])) as Array<{
    id: string; app: string; action: string; requester_id: string; requester_role: string; input_json: string; reason: string;
    status: string; policy: string; decided_by: string | null; decided_at: string | null; decision_reason: string | null; result_json: string | null; created_at: string;
  }>;
}

export function listAudit(limit = 100) {
  return db().prepare("SELECT * FROM audit_log ORDER BY id DESC LIMIT ?").all(limit) as Array<{
    id: number; ts: string; app: string; actor_id: string; actor_role: string; event: string; action: string | null; request_id: string | null;
    before_json: string | null; after_json: string | null; reason: string | null; detail: string | null;
  }>;
}

export function listDenials(limit = 100) {
  return db().prepare("SELECT * FROM denials ORDER BY id DESC LIMIT ?").all(limit) as Array<{
    id: number; ts: string; app: string; actor_id: string; actor_role: string; kind: string; detail: string;
  }>;
}
