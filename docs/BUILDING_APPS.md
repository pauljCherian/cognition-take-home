# Building apps on the internal-tools platform

This is the full reference behind `AGENTS.md`. Audience: a coding agent (or engineer) asked to build app #N.

## 1. Mental model

| Primitive | What it is | Who writes it |
|---|---|---|
| **Resource** | A connector + credential + schema, listed in `RESOURCE_CATALOG` (`src/platform/resources.ts`) | platform team, rarely |
| **Manifest** | `src/apps/<app>/manifest.yaml` — what the app may read, write, and which actions exist with which policy | app owner + resource owner + security; reviewed as a permission change |
| **Action** | Named, typed, audited write. Policy (`can_act`, `requires_approval_when`, `approvers`, `limits`) lives in the manifest; the write lives in `actions.ts` | **you** |
| **Page** | UI that reads with `query()` and writes with `/api/actions/<app>/<action>`. `GenericApp` renders one from the manifest with no code | you, only if needed |

The runtime guarantees, for every app, without app code:
role check → input validation → hard limits → approval predicate → (pending ‖ execute) → audit row in the **same transaction**
as the write; approver ≠ requester by user id; PII masked before serialization; every denied attempt logged.

## 2. Manifest reference

```yaml
app: kyc-queue                 # must equal the directory name
title: KYC review queue
owner: compliance-ops          # team accountable for this app
roles_with_access: [kyc_analyst, auditor]   # roles that may open the app at all

reads:
  db.kyc:                      # must exist in RESOURCE_CATALOG
    tables:
      kyc_cases: [id, customer_id, reason, status, risk_score, sanctions_hit, sla_due_at]   # column allowlist
  stripe:
    endpoints: [GET /v1/charges/{id}]          # {x} matches one path segment

writes:
  db.kyc:
    tables: { kyc_cases: [status, decided_at, decision_reason, assigned_to] }   # columns execute() may change
    via_action: kyc.decide     # the ONLY way to reach this write
  stripe:
    endpoints: [POST /v1/refunds]
    via_action: refund.issue

actions:
  kyc.decide:
    description: Approve or reject a KYC case
    input:                     # typed; validated before your code runs
      case_id:  { type: string }
      decision: { type: enum, values: [approve, reject] }
      amount:   { type: number }
      force:    { type: boolean, required: false }
    can_act: [kyc_analyst]
    requires_approval_when:    # OR of conditions; each is on an input field or a context fact
      - { context: sanctions_hit, op: eq, value: true }
      - { field: decision, op: eq, value: reject }
    approvers: [kyc_analyst]   # requester ≠ approver is enforced by user id even when roles overlap
    limits: { amount: { min: 1, max: 10000 } }   # hard ceiling; no approval can exceed it
    reason_required: true      # free-text `reason` on the request body, stored in the audit row

pii:
  kyc_cases.customer_id: { visible_to: [auditor] }   # masked for every other role
denied_by_default: true        # must be true
```

Schema: `manifestSchema` in `src/platform/manifest.ts`. Ops: `gt gte lt lte eq neq`. Input types: `string number boolean enum`.
Reserved request-body key: `reason` (do not name an input `reason`; use e.g. `reason_code`).

Validation also enforces: `via_action` exists; conditions/limits reference declared inputs; roles are in `roles_with_access`;
PII keys are declared read columns; every resource/table/column/endpoint exists in the catalog.

## 3. actions.ts reference

```ts
import type { AppModule } from "@/platform/engine";
import { db } from "@/platform/db";

export const actions: AppModule["actions"] = {
  "kyc.decide": {
    // Optional. Facts for requires_approval_when `context:` conditions. Runs before the policy check.
    context(input) {
      const c = db().prepare("SELECT sanctions_hit FROM kyc_cases WHERE id = ?").get(input.case_id) as { sanctions_hit: number } | undefined;
      return { sanctions_hit: !!c?.sanctions_hit };
    },
    // Optional. Runs at submit time (to refuse invalid states before a request reaches the approval inbox) and again
    // inside the execute transaction; the latter result is stored as `before` in the audit row. Throw DeniedError("state", ...) for invalid states.
    before(input) {
      return db().prepare("SELECT status, decided_at FROM kyc_cases WHERE id = ?").get(input.case_id);
    },
    // Required. The write. Runs after role/input/limits/approval pass; for approval flows it runs when the approver approves.
    execute(ctx, input) {
      ctx.db.prepare("UPDATE kyc_cases SET status = ?, decided_at = ?, decision_reason = ? WHERE id = ?")
        .run(input.decision === "approve" ? "approved" : "rejected", new Date().toISOString(), ctx.reason, input.case_id);
      return { case_id: input.case_id, status: input.decision };   // becomes `after` in the audit row
    },
  },
};
```

`ctx`: `{ actor, requestId, reason, db, http(resource) }`.
- `ctx.http("stripe").post(path, body)` / `.get(path)` — refuses undeclared method/path (403 + denial row). Use `ctx.requestId` as the idempotency key.
- `ctx.db` — the transaction-bound SQLite handle. Only touch `writes.<res>.tables`. (Prod: a per-app DB role makes this physical.)
- Throw `new DeniedError("state", "...")` (`src/platform/errors.ts`) for domain-invalid requests; it becomes a 403 and a denial row.

Everything else in the module is ignored; there is no registry to edit — apps are discovered from `src/apps/<app>/actions.ts`.

## 4. UI

Default: `src/app/<app>/page.tsx` renders `<GenericApp manifest actor />` — one table per declared read table, one form per
action, inputs derived from the manifest, PII masking and role gating applied. Good enough for most back-office tools.

Bespoke UI (`src/app/refunds` is the reference):
- Server component: `const rows = query(getManifest("refunds"), getActor(), { resource: "db.payments", table: "payments", columns: [...], where: {...}, orderBy: "created_at", limit: 50 })`.
- Client component: `callApi("/api/actions/<app>/<action>", { ...input, reason })` from `src/components/ActionResult.tsx`; render the `<ActionResult/>` so executed / pending / 403 states are visible.
- Never fetch the DB or a connector directly from UI code.

## 5. HTTP API (what the UI and tests use)

| Endpoint | Purpose | Responses |
|---|---|---|
| `POST /api/actions/<app>/<action>` body `{...input, reason}` | invoke an action | `200 executed`, `202 pending`, `403 {kind: role|input|limit|state|write_scope, denied: true}` |
| `POST /api/approvals/<requestId>` body `{decision: approve|reject, note}` | maker-checker decision | `200`, `403 self_approval|role|state` |
| `POST /api/query/<app>` body `{resource, table, columns, where?, limit?}` | manifest-checked read | `200 rows`, `403 read_scope` |
| `POST /api/resources/<app>/<resource>` | raw connector write — always denied; exists to prove it | `403 write_scope` |
| `POST /api/builder/validate` body `{yaml}` | validate a manifest, get lint + Devin prompt | `200 {ok, errors, lint, prompt}` |
| `POST /api/builder/scaffold` body `{yaml}` (dev only) | write manifest + stubs | `200 {files}` |

Actor: cookie `itp_actor` (set via `/api/actor`) or header `x-actor: u_sam`. Prototype users are in `src/platform/identity.ts`.

## 6. Tests

Every app PR must prove its policy. Minimum, via the HTTP API with `x-actor` headers:

1. allowed role, low-risk input → `200`, audit row has `before`/`after`/`reason`
2. role not in `can_act` → `403 role`, denial row
3. input hitting `requires_approval_when` → `202 pending`; approve as a different user with an approver role → `200`
4. same user approving their own request → `403 self_approval`
5. input outside `limits` → `403 limit`
6. a read of an undeclared column via `/api/query` → `403 read_scope`

`scripts/smoke.sh <app>` shows the shape. Governance panel → "Live denials" should show 2, 4, 5, 6 after the run.

## 7. Scaffolder and builder

- `/builder`: compose from the catalog, see YAML + validation + SoD lint + governance preview live, then **scaffold** (dev) or
  **copy the Devin prompt** (the prompt embeds the manifest and these rules).
- `npm run new-app -- --from manifest.yaml [--force]`: same scaffolder from the CLI. Idempotent on `--force`.
- Production: the builder never writes to disk; it produces a PR containing only the manifest, which the resource owner approves
  before any app code is written.

## 8. Don'ts

- Don't edit `src/platform/**` in an app PR. If the platform is missing something, that's a separate PR with security review.
- Don't add a column/endpoint to the manifest because the UI "needs" it. Ask.
- Don't catch and swallow `DeniedError`. Let it surface — the denial is the feature.
- Don't write audit rows yourself. The engine does, in the same transaction.
