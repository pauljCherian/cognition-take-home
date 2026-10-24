import { execFileSync } from "node:child_process";
import { USERS } from "./identity";
import { loadManifests, manifestPath, ROLES, type Manifest, type Role } from "./manifest";
import { RESOURCE_CATALOG } from "./resources";

export type ColumnAccess = { resource: string; table: string; column: string; readers: { app: string; roles: Role[] }[]; pii?: { app: string; visible_to: Role[] }[]; inCatalog: boolean };

/** Inverted view: for every column any app can read, who can read it. */
export function columnAccessMatrix(manifests = loadManifests()): ColumnAccess[] {
  const map = new Map<string, ColumnAccess>();
  for (const m of manifests) {
    for (const [resource, r] of Object.entries(m.reads)) {
      for (const [table, cols] of Object.entries(r.tables)) {
        for (const column of cols) {
          const key = `${resource}.${table}.${column}`;
          const inCatalog = RESOURCE_CATALOG[resource]?.tables?.[table]?.includes(column) ?? false;
          const e: ColumnAccess = map.get(key) ?? { resource, table, column, readers: [], inCatalog };
          const pii = m.pii[`${table}.${column}`];
          e.readers.push({ app: m.app, roles: pii ? pii.visible_to.filter((x) => m.roles_with_access.includes(x)) : m.roles_with_access });
          if (pii) (e.pii ??= []).push({ app: m.app, visible_to: pii.visible_to });
          map.set(key, e);
        }
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => (a.resource + a.table + a.column).localeCompare(b.resource + b.table + b.column));
}

/** Columns that exist in the catalog but no app may read: the sensitive ones should be here. */
export function unreachableColumns(manifests = loadManifests()) {
  const reachable = new Set(columnAccessMatrix(manifests).map((c) => `${c.resource}.${c.table}.${c.column}`));
  const out: string[] = [];
  for (const [resource, r] of Object.entries(RESOURCE_CATALOG)) {
    for (const [table, cols] of Object.entries(r.tables ?? {})) {
      for (const c of cols) if (!reachable.has(`${resource}.${table}.${c}`)) out.push(`${resource}.${table}.${c}`);
    }
  }
  return out;
}

export type EffectivePermission = { app: string; action: string; canAct: boolean; canApprove: boolean };

/** Per-user: what can this person do across all apps? This is the quarterly access-review export. */
export function effectivePermissions(role: Role, manifests = loadManifests()) {
  const apps = manifests.filter((m) => m.roles_with_access.includes(role)).map((m) => m.app);
  const actions: EffectivePermission[] = [];
  for (const m of manifests) {
    for (const [name, a] of Object.entries(m.actions)) {
      const canAct = a.can_act.includes(role);
      const canApprove = a.approvers.includes(role);
      if (canAct || canApprove) actions.push({ app: m.app, action: name, canAct, canApprove });
    }
  }
  const unmask = columnAccessMatrix(manifests)
    .filter((c) => c.pii?.some((p) => p.visible_to.includes(role)))
    .map((c) => `${c.table}.${c.column}`);
  return { apps, actions, unmask };
}

export function accessReview(manifests = loadManifests()) {
  return USERS.map((u) => ({ user: u, ...effectivePermissions(u.role, manifests) }));
}

/** Segregation-of-duties check: an action whose actors and approvers overlap by role is flagged. */
export function sodFindings(manifests = loadManifests()) {
  const findings: { app: string; action: string; issue: string }[] = [];
  for (const m of manifests) {
    for (const [name, a] of Object.entries(m.actions)) {
      if (a.requires_approval_when.length && a.approvers.length === 0) findings.push({ app: m.app, action: name, issue: "requires approval but declares no approvers" });
      const overlap = a.can_act.filter((r) => a.approvers.includes(r));
      if (overlap.length) findings.push({ app: m.app, action: name, issue: `same role can request and approve (${overlap.join(", ")}); platform still blocks self-approval by user id` });
      if (Object.keys(a.limits).length === 0 && Object.values(a.input).some((f) => f.type === "number")) findings.push({ app: m.app, action: name, issue: "numeric input without a hard limit" });
    }
    for (const [res, w] of Object.entries(m.writes)) {
      for (const via of w.via_actions) if (!m.actions[via]) findings.push({ app: m.app, action: via, issue: `write to ${res} routed via undeclared action` });
    }
  }
  return findings;
}

/** Drift: manifest references something the resource catalog does not have. */
export function driftFindings(manifests = loadManifests()) {
  const out: { app: string; issue: string }[] = [];
  for (const m of manifests) {
    for (const [resource, r] of Object.entries({ ...m.reads, ...m.writes })) {
      const cat = RESOURCE_CATALOG[resource];
      if (!cat) { out.push({ app: m.app, issue: `resource ${resource} not in catalog` }); continue; }
      for (const [t, cols] of Object.entries(r.tables)) {
        if (!cat.tables?.[t]) { out.push({ app: m.app, issue: `${resource}.${t} not in catalog` }); continue; }
        for (const c of cols) if (!cat.tables[t].includes(c)) out.push({ app: m.app, issue: `${resource}.${t}.${c} not in catalog` });
      }
      for (const e of r.endpoints) if (!cat.endpoints?.includes(e)) out.push({ app: m.app, issue: `${resource} ${e} not in catalog` });
    }
  }
  return out;
}

export type ManifestChange = { app: string; sha: string; author: string; date: string; subject: string };

/** Manifest change log straight from git. In prod: PR + required reviewers (resource owner, security). */
export function manifestHistory(manifests = loadManifests()): ManifestChange[] {
  const out: ManifestChange[] = [];
  for (const m of manifests) {
    try {
      const log = execFileSync("git", ["log", "--format=%h%x09%an%x09%ad%x09%s", "--date=short", "--", manifestPath(m.app)], { cwd: process.cwd(), encoding: "utf8" });
      for (const line of log.split("\n").filter(Boolean)) {
        const [sha, author, date, subject] = line.split("\t");
        out.push({ app: m.app, sha, author, date, subject });
      }
    } catch { /* not a git repo */ }
  }
  return out;
}

export function allRoles() { return ROLES; }
export type { Manifest };
