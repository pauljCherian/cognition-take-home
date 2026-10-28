# internal-tools-platform

A prototype internal-tools platform for a fintech, built with Devin as a Power Apps alternative.
Next.js 14 + TypeScript + SQLite, runs locally with no accounts or keys.

## What it does

Instead of building each internal tool as its own app, every app on this platform is defined by a **capability
manifest** (`src/apps/<app>/manifest.yaml`): what it may **read** (per resource, table and column), what it may
**write** (and the single named **action** allowed to perform that write), **who** may act, when an action needs
**approval** and by whom, **hard limits** no approval can exceed, and which fields are **PII** and who sees them
unmasked. Anything not declared is unreachable at runtime: the request gets a typed 403 and a row in the denials log.

The platform supplies, once, what every fintech internal tool otherwise rebuilds: roles, maker-checker approvals
(approver must be a different user), append-only audit written in the same transaction as the change, PII masking,
scoped connectors, idempotent writes, and a **governance panel** generated from the manifests: per-app capabilities,
"who can read this column" across all apps, per-user access review, segregation-of-duties lint, manifest-vs-catalog
drift, live denied attempts, manifest change history.

Three apps run on it: a **refunds dashboard** (HTTP write to a mocked Stripe, approval above $500 / repeat refunds /
open dispute / high-risk customer, $10k hard ceiling), a **feature-flag admin** (DB write, prod changes need a second
engineer, kill switch immediate), and a **KYC review queue** (four-eyes on sanctions hits and rejections, OCR fields
masked). A fourth, a disputes dashboard, is built live in the demo video.

New apps are added through `/builder`: pick resources, tables and columns from the catalog, declare actions and
policies, see the manifest, validation, SoD lint and governance preview update live, then scaffold. The app is live
immediately with a generic table + form UI; the only code left to write is the body of each action, which is what
Devin does from the generated prompt. `AGENTS.md` and `docs/BUILDING_APPS.md` are the contract a coding agent follows.

The design argument: Power Apps starts from a screen and reaches whatever the connector credential allows; this
starts from a reviewed declaration of what the app may touch and makes everything else unreachable. The permission
review becomes a 40-line YAML diff, governance evidence is derived rather than maintained, and an agent's generated
code is safe by construction rather than by review. What it gives up is Power Apps' real strength: non-engineers
editing a form in five minutes, a thousand connectors, and no system of your own to run.

## How to run

Requires Node 18.17+.

```bash
git clone https://github.com/pauljCherian/cognition-take-home.git
cd cognition-take-home
npm install
npm run dev            # http://localhost:3000
```

The SQLite database is created and seeded on first start at `data/platform.db`. To reset to the seeded state
(e.g. before a demo), stop the server and `rm data/platform.db*`, then start it again.

Other commands:

```bash
npm run typecheck && npm run lint
scripts/smoke.sh refunds        # policy checks via the HTTP API (allowed / wrong role / approval / self-approval / limit / read scope)
scripts/smoke.sh kyc-queue
npm run new-app -- --from path/to/manifest.yaml   # CLI equivalent of the builder's scaffold
```

There is no login; the **actor dropdown** (top right) stands in for SSO. Actors: Sam (support), Fiona (finance),
Frank (finance approver), Kai and Kim (KYC analysts), Erin and Eli (engineers), Ada (auditor).

## Demo path

The UI has two workspaces: **Apps** (operators) and **Governance** (security, auditors, platform owners).

1. As **Sam**, open Refunds. Email is masked and two apps show as "no access": both come from the manifest.
2. Refund $20 on `pay_8f3a` → executed, audit row written.
3. Refund $1,500 on `pay_91cc` → pending (over $500). Switch to **Frank** → Approval inbox → approve.
   Switch back to Sam and try to approve your own request → 403 self-approval.
4. Expand **Try to bypass the UI**: raw `POST /v1/refunds`, read `customers.ssn_last4`, a $20k refund → three 403s
   (`write_scope`, `read_scope`, `limit`), all listed under Governance → Denied attempts.
5. Governance → Data access by column: who can read `customers.email`, across every app. Segregation of duties:
   roles that can both request and approve.
6. As **Erin**, Flags: enable `instant_payouts` in dev (immediate), in prod (pending; Eli approves). Kill switch is immediate.
7. As **Kai**, KYC queue: approve `kyc_301` (executed); decide `kyc_302`, a sanctions hit (pending; Kim approves; Kai cannot).
   As **Ada**, OCR name/DOB are masked.
8. Governance → **+ New app**: compose a `disputes` app (read `db.payments.disputes`, action `dispute.close`, approval when
   `outcome == lost`), scaffold, open `/disputes` as Fiona. The table and form work; the action says TODO until implemented.
   Copy the Devin prompt from the right pane; that prompt plus `AGENTS.md` is everything an agent needs.
9. Edit `src/apps/refunds/manifest.yaml`, remove `card_last4` from `payments`, reload Refunds: fails closed with a logged denial.

Shot-by-shot script, the Power Apps contrast and the adoption plan are in `docs/DEMO_SCRIPT.md`.

## What is real and what is stubbed

Real: manifest schema, loader and runtime enforcement (column and endpoint allowlists, DB writes statement-checked
against the owning action's grant, denial logging); the action engine (role → typed input → hard limits → approval
predicate → execute, with `before()` state checks at submit and at execution); approvals with approver-role and
requester≠approver checks; append-only audit in the same transaction with DB triggers blocking UPDATE/DELETE; PII
masking by role; idempotent refund execution; the governance panel; the builder, scaffolder and generic UI; three apps.

Stubbed, and what production would replace them with: SSO (actor dropdown → OIDC groups mapped to roles); Postgres
(SQLite → per-app DB roles with grants compiled from the manifests, so enforcement is physical rather than parsed);
Stripe and KYC vendor (in-process mocks → connectors behind the same allowlist with credentials from a secrets manager);
the builder's scaffold writes to disk in development and is disabled in production (intended flow: it opens a
manifest-only PR for resource-owner and security review, then an agent implements the app in a second PR).
Those four replacements are the real 6–8 weeks of a build decision; see `docs/RECOMMENDATION.md`.

## Time spent

Core platform, refunds and flags apps, and the governance panel took about two hours. A second pass added the builder,
the KYC app built through it, docs for coding agents, two recorded end-to-end test runs (which found and fixed real bugs:
a double-submit, a raw DB handle that let app code bypass the write grant, missing denial rows on state failures),
the two-workspace shell, and the recommendation. The second pass was deliberately spent on proving the "app #N"
path rather than polishing the three apps, since that path is the actual question.

## Repository layout

```
src/platform/           manifest schema + loader, resource catalog + enforcement, action/approval/audit engine,
                        governance queries, scaffolder, identity (stub), SQLite schema + seeds
src/apps/<app>/         manifest.yaml (reviewed as a permission change) + actions.ts (domain code, scoped ctx only)
src/app/                Next.js routes: apps, approvals, governance, builder, API under src/app/api
src/components/         Shell (Apps / Governance workspaces), GenericApp, GenericActions, ActorSwitcher
scripts/                new-app.ts (CLI scaffolder), smoke.sh (policy checks)
docs/BUILDING_APPS.md   full reference for building an app on the platform (for humans and agents)
docs/DEMO_SCRIPT.md     demo shot list, Power Apps contrast, adoption plan with Devin
docs/RECOMMENDATION.md  build-vs-buy recommendation and cost model
docs/NOTES.md           design notes: fintech vs generic needs, manifest vs DLP, real vs stubbed
AGENTS.md               the contract a coding agent follows when adding an app
```
