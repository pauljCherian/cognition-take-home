import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DB_PATH = path.join(process.cwd(), "data", "platform.db");

declare global {
  // eslint-disable-next-line no-var
  var __itp_db: Database.Database | undefined;
}

export function db(): Database.Database {
  if (globalThis.__itp_db) return globalThis.__itp_db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const d = new Database(DB_PATH);
  d.pragma("journal_mode = WAL");
  d.pragma("foreign_keys = ON");
  migrate(d);
  seed(d);
  globalThis.__itp_db = d;
  return d;
}

function migrate(d: Database.Database) {
  d.exec(`
  -- ===== business data (stands in for the fintech's Postgres) =====
  CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY, email TEXT NOT NULL, full_name TEXT NOT NULL,
    ssn_last4 TEXT NOT NULL, risk_tier TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id),
    amount_cents INTEGER NOT NULL, currency TEXT NOT NULL, card_last4 TEXT NOT NULL,
    card_pan TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS disputes (
    id TEXT PRIMARY KEY, payment_id TEXT NOT NULL REFERENCES payments(id),
    status TEXT NOT NULL, opened_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS feature_flags (
    key TEXT NOT NULL, environment TEXT NOT NULL, enabled INTEGER NOT NULL,
    rollout_pct INTEGER NOT NULL DEFAULT 100, description TEXT NOT NULL,
    updated_at TEXT NOT NULL, PRIMARY KEY (key, environment)
  );
  -- ===== mock payment processor (stands in for Stripe) =====
  CREATE TABLE IF NOT EXISTS stripe_refunds (
    id TEXT PRIMARY KEY, charge_id TEXT NOT NULL, amount_cents INTEGER NOT NULL,
    reason TEXT NOT NULL, idempotency_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL
  );
  -- ===== platform tables =====
  CREATE TABLE IF NOT EXISTS action_requests (
    id TEXT PRIMARY KEY, app TEXT NOT NULL, action TEXT NOT NULL,
    requester_id TEXT NOT NULL, requester_role TEXT NOT NULL,
    input_json TEXT NOT NULL, reason TEXT NOT NULL,
    status TEXT NOT NULL, -- pending | executed | rejected
    policy TEXT NOT NULL, -- allow | requires_approval
    decided_by TEXT, decided_at TEXT, decision_reason TEXT,
    result_json TEXT, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL,
    app TEXT NOT NULL, actor_id TEXT NOT NULL, actor_role TEXT NOT NULL,
    event TEXT NOT NULL, action TEXT, request_id TEXT,
    before_json TEXT, after_json TEXT, reason TEXT, detail TEXT
  );
  CREATE TABLE IF NOT EXISTS denials (
    id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL,
    app TEXT NOT NULL, actor_id TEXT NOT NULL, actor_role TEXT NOT NULL,
    kind TEXT NOT NULL, -- read_scope | write_scope | role | limit | self_approval | input
    detail TEXT NOT NULL
  );
  -- audit_log is append-only: no UPDATE/DELETE, enforced at the DB layer.
  CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_log
    BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
  CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_log
    BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
  `);
}

function seed(d: Database.Database) {
  const n = d.prepare("SELECT COUNT(*) AS c FROM customers").get() as { c: number };
  if (n.c > 0) return;
  const now = Date.now();
  const iso = (daysAgo: number) => new Date(now - daysAgo * 86400000).toISOString();
  const customers = [
    ["c_1001", "maya.l@example.com", "Maya Lindqvist", "4821", "low"],
    ["c_1002", "jordan.p@example.com", "Jordan Park", "1190", "medium"],
    ["c_1003", "a.okafor@example.com", "Adaeze Okafor", "7733", "high"],
    ["c_1004", "tom.b@example.com", "Tom Brennan", "0042", "low"],
  ];
  const insC = d.prepare("INSERT INTO customers VALUES (?,?,?,?,?,?)");
  customers.forEach((c, i) => insC.run(...c, iso(400 - i * 30)));
  const payments = [
    ["pay_8f3a", "c_1001", 12000, "USD", "4242", "4242424242424242", "succeeded", 2],
    ["pay_91cc", "c_1001", 189900, "USD", "4242", "4242424242424242", "succeeded", 9],
    ["pay_a2d0", "c_1002", 45000, "USD", "5556", "5555555555554444", "succeeded", 1],
    ["pay_b771", "c_1002", 999, "USD", "5556", "5555555555554444", "succeeded", 20],
    ["pay_c3e9", "c_1003", 250000, "USD", "0005", "378282246310005", "succeeded", 4],
    ["pay_d410", "c_1003", 72000, "USD", "0005", "378282246310005", "succeeded", 40],
    ["pay_e55b", "c_1004", 3200, "USD", "1117", "6011111111111117", "succeeded", 3],
    ["pay_f6a2", "c_1004", 150000, "USD", "1117", "6011111111111117", "succeeded", 12],
  ];
  const insP = d.prepare("INSERT INTO payments VALUES (?,?,?,?,?,?,?,?)");
  payments.forEach((p) => insP.run(...p.slice(0, 7), iso(p[7] as number)));
  d.prepare("INSERT INTO disputes VALUES (?,?,?,?)").run("dp_1", "pay_c3e9", "open", iso(1));
  const insF = d.prepare("INSERT INTO feature_flags VALUES (?,?,?,?,?,?)");
  for (const [key, desc] of [
    ["instant_payouts", "Enable instant payouts for verified merchants"],
    ["new_kyc_flow", "Route new signups through the v2 KYC flow"],
    ["card_freeze", "Expose card freeze/unfreeze in the mobile app"],
  ]) {
    insF.run(key, "dev", 1, 100, desc, iso(5));
    insF.run(key, "staging", 1, 100, desc, iso(4));
    insF.run(key, "prod", key === "card_freeze" ? 1 : 0, key === "card_freeze" ? 25 : 0, desc, iso(3));
  }
}

export function nowIso() {
  return new Date().toISOString();
}

export function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}
