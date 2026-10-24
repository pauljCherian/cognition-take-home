import type Database from "better-sqlite3";
import { db, newId, nowIso } from "./db";
import { DeniedError } from "./errors";
import type { Actor } from "./identity";
import type { Manifest } from "./manifest";

// A Resource = connector + credential + schema. In prod `db.payments` is a Postgres
// role whose GRANTs are compiled from the manifest; `stripe` is an allowlist proxy.
// Here both are enforced in-process against the same manifest, and every denial is logged.

export const RESOURCE_CATALOG: Record<string, { kind: "database" | "http"; description: string; tables?: Record<string, string[]>; endpoints?: string[] }> = {
  "db.payments": {
    kind: "database",
    description: "Primary Postgres (read replica). Credential: pg/internal-tools, per-app role.",
    tables: {
      customers: ["id", "email", "full_name", "ssn_last4", "risk_tier", "created_at"],
      payments: ["id", "customer_id", "amount_cents", "currency", "card_last4", "card_pan", "status", "created_at"],
      disputes: ["id", "payment_id", "status", "opened_at"],
    },
  },
  "db.flags": {
    kind: "database",
    description: "Feature-flag store (own table). Credential: pg/flags, per-app role.",
    tables: { feature_flags: ["key", "environment", "enabled", "rollout_pct", "description", "updated_at"] },
  },
  "db.kyc": {
    kind: "database",
    description: "KYC case store (synced from IDV vendor webhooks). Credential: pg/kyc, per-app role.",
    tables: {
      kyc_cases: ["id", "customer_id", "reason", "status", "risk_score", "sanctions_hit", "doc_type", "doc_country", "assigned_to", "sla_due_at", "created_at", "decided_at", "decision_reason"],
      kyc_documents: ["id", "case_id", "kind", "storage_url", "ocr_name", "ocr_dob", "ocr_id_number"],
    },
  },
  stripe: {
    kind: "http",
    description: "Payment processor. Credential: stripe restricted key (refunds:write, charges:read).",
    endpoints: ["GET /v1/charges/{id}", "POST /v1/refunds", "GET /v1/refunds/{id}", "POST /v1/payouts"],
  },
};

export function logDenial(app: string, actor: Actor, kind: DeniedError["kind"], detail: string) {
  db().prepare("INSERT INTO denials (ts, app, actor_id, actor_role, kind, detail) VALUES (?,?,?,?,?,?)").run(
    nowIso(), app, actor.id, actor.role, kind, detail,
  );
}

type Where = Record<string, string | number>;

export type QuerySpec = {
  resource: string;
  table: string;
  columns: string[];
  where?: Where;
  orderBy?: string;
  limit?: number;
};

const IDENT = /^[a-z_][a-z0-9_]*$/;

/** Read through the manifest's column allowlist; mask PII the actor may not see. */
export function query(manifest: Manifest, actor: Actor, spec: QuerySpec): Record<string, unknown>[] {
  const deny = (msg: string) => {
    logDenial(manifest.app, actor, "read_scope", msg);
    throw new DeniedError("read_scope", msg);
  };
  if (!manifest.roles_with_access.includes(actor.role)) {
    logDenial(manifest.app, actor, "role", `role ${actor.role} has no access to app ${manifest.app}`);
    throw new DeniedError("role", `role ${actor.role} has no access to app ${manifest.app}`);
  }
  const allowed = manifest.reads[spec.resource]?.tables?.[spec.table];
  if (!allowed) deny(`${spec.resource}.${spec.table} is not in ${manifest.app}'s read scope`);
  const cols = spec.columns;
  for (const c of [...cols, ...Object.keys(spec.where ?? {})]) {
    if (!IDENT.test(c)) deny(`bad identifier ${c}`);
    if (!allowed!.includes(c)) deny(`column ${spec.table}.${c} is not in ${manifest.app}'s read scope`);
  }
  if (spec.orderBy && !allowed!.includes(spec.orderBy.replace(/ (asc|desc)$/i, ""))) deny(`order by ${spec.orderBy} out of scope`);

  const whereKeys = Object.keys(spec.where ?? {});
  const sql =
    `SELECT ${cols.join(", ")} FROM ${spec.table}` +
    (whereKeys.length ? ` WHERE ${whereKeys.map((k) => `${k} = ?`).join(" AND ")}` : "") +
    (spec.orderBy ? ` ORDER BY ${spec.orderBy}` : "") +
    ` LIMIT ${Math.min(spec.limit ?? 200, 1000)}`;
  const rows = db().prepare(sql).all(...whereKeys.map((k) => spec.where![k])) as Record<string, unknown>[];

  // Masking is applied before anything leaves the platform layer.
  for (const col of cols) {
    const rule = manifest.pii[`${spec.table}.${col}`];
    if (rule && !rule.visible_to.includes(actor.role)) {
      for (const r of rows) r[col] = mask(String(r[col] ?? ""));
    }
  }
  return rows;
}

function mask(v: string) {
  if (v.includes("@")) return v[0] + "•••@" + v.split("@")[1];
  return v.length > 4 ? "•".repeat(v.length - 4) + v.slice(-4) : "••••";
}

// ---- HTTP resource (mock Stripe). Only reachable from inside an Action's execute(). ----

export type HttpWriter = (method: "POST" | "GET", path: string, body?: Record<string, unknown>, opts?: { idempotencyKey?: string }) => unknown;

/**
 * Statement-level write scoping for the prototype's SQLite handle: INSERT/UPDATE/DELETE must target a table the
 * manifest grants to this action, and UPDATE may only SET granted columns. Reads pass through. In production this is
 * compiled into a per-app Postgres role (GRANT UPDATE (cols) ON table), so the check is physical rather than parsed.
 */
export function scopedDb(manifest: Manifest, actor: Actor, actionName: string, d: Database.Database): Database.Database {
  const check = (sql: string) => {
    const m = /^\s*(update|insert\s+into|delete\s+from)\s+"?(\w+)"?/i.exec(sql);
    if (!m) return;
    const table = m[2];
    const grant = Object.values(manifest.writes).find((w) => w.via_actions.includes(actionName) && w.tables[table]);
    const deny = (msg: string): never => {
      logDenial(manifest.app, actor, "write_scope", `${actionName}: ${msg}`);
      throw new DeniedError("write_scope", msg);
    };
    if (!grant) deny(`${actionName} may not write table ${table} (not in writes.*.tables for this action)`);
    if (/^\s*update/i.test(sql)) {
      const set = /\bset\b([\s\S]*?)(\bwhere\b|$)/i.exec(sql)?.[1] ?? "";
      for (const part of set.split(",")) {
        const col = part.split("=")[0].trim().replace(/"/g, "");
        if (col && !grant!.tables[table].includes(col)) deny(`${actionName} may not set ${table}.${col}`);
      }
    }
  };
  return new Proxy(d, {
    get(target, prop, receiver) {
      if (prop === "prepare") return (sql: string) => { check(sql); return target.prepare(sql); };
      if (prop === "exec") return (sql: string) => { check(sql); return target.exec(sql); };
      const v = Reflect.get(target, prop, receiver);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
}

export function endpointMatches(pattern: string, method: string, path: string) {
  const [pm, pp] = pattern.split(" ");
  if (pm !== method) return false;
  const re = new RegExp("^" + pp.replace(/\{[^}]+\}/g, "[^/]+") + "$");
  return re.test(path);
}

/** Build a writer scoped to what the manifest allows for this resource via this action. */
export function scopedHttp(manifest: Manifest, actor: Actor, resource: string, viaAction: string): HttpWriter {
  return (method, path, body, opts) => {
    const w = manifest.writes[resource];
    const readOk = manifest.reads[resource]?.endpoints?.some((e) => endpointMatches(e, method, path));
    const writeOk = w && w.via_actions.includes(viaAction) && w.endpoints.some((e) => endpointMatches(e, method, path));
    if (!(readOk || writeOk)) {
      const msg = `${method} ${path} on ${resource} is not in ${manifest.app}'s scope (via ${viaAction})`;
      logDenial(manifest.app, actor, "write_scope", msg);
      throw new DeniedError("write_scope", msg);
    }
    return mockStripe(method, path, body ?? {}, opts?.idempotencyKey, actor);
  };
}

function mockStripe(method: string, path: string, body: Record<string, unknown>, idem: string | undefined, actor: Actor) {
  const d = db();
  if (method === "POST" && path === "/v1/refunds") {
    if (!idem) throw new Error("idempotency key required");
    const existing = d.prepare("SELECT * FROM stripe_refunds WHERE idempotency_key = ?").get(idem);
    if (existing) return existing; // retry-safe: never double-refund
    const id = newId("re");
    d.prepare("INSERT INTO stripe_refunds VALUES (?,?,?,?,?,?)").run(id, body.charge, body.amount, body.reason, idem, nowIso());
    d.prepare("UPDATE payments SET status = 'refunded' WHERE id = ?").run(body.charge);
    return { id, charge: body.charge, amount: body.amount, status: "succeeded", metadata: { actor: actor.id } };
  }
  const m = path.match(/^\/v1\/charges\/([^/]+)$/);
  if (method === "GET" && m) {
    return d.prepare("SELECT id, amount_cents AS amount, currency, status FROM payments WHERE id = ?").get(m[1]) ?? null;
  }
  throw new Error(`mock stripe: unhandled ${method} ${path}`);
}

/** Direct resource access from app code or a raw API call. Always refused for writes. */
export function rawResourceCall(manifest: Manifest, actor: Actor, resource: string, method: string, path: string): never {
  const msg = `direct ${method} ${path} on ${resource} refused: writes are only reachable through a declared Action`;
  logDenial(manifest.app, actor, "write_scope", msg);
  throw new DeniedError("write_scope", msg);
}
