# AGENTS.md — how to build an app on this platform

You are building an internal tool for a fintech. The platform already provides SSO/roles, authorization,
approvals (maker-checker), an append-only audit log, PII masking, and connector credentials. **You do not
implement any of those.** You implement one thing: the domain write inside each declared action.

## The contract
`src/apps/<app>/manifest.yaml` is the capability manifest. It is the *only* thing that grants an app access.
Everything not declared in it is denied at runtime (403 + a row in `denials`), regardless of what the code does.

- **Never widen the manifest to make code work.** If the task needs a column, endpoint or write that the manifest
  doesn't grant, stop and ask the resource owner. A manifest diff is a permission change and is reviewed as one.
- Reads go through `query(manifest, actor, {resource, table, columns, ...})` (`src/platform/resources.ts`).
- Writes go only through actions: `POST /api/actions/<app>/<action>` → `invoke()` → your `execute()`.
- Inside `execute(ctx, input)` you may only use `ctx.http(<resource>)` on declared endpoints and `ctx.db` on declared tables.

## Workflow (10–30 minutes per app)
1. Get a reviewed manifest. Compose one at `/builder` (catalog-driven, validates live) or write it by hand.
2. `npm run new-app -- --from path/to/manifest.yaml` → creates `src/apps/<app>/{manifest.yaml,actions.ts}` and
   `src/app/<app>/page.tsx` (generic table+form UI). The app is live at `/<app>` immediately.
3. Implement the `TODO`s in `actions.ts`: `context()` (facts used by `requires_approval_when`), `before()` (snapshot
   for audit), `execute()` (the write). Nothing else.
4. Only if the generic UI is insufficient, write a bespoke `src/app/<app>/page.tsx` + client component. Follow
   `src/app/refunds/` as the reference. Still read via `query()` and write via `/api/actions/...`.
5. Add tests (see `docs/BUILDING_APPS.md#tests`): allowed, wrong role 403, approval predicate → 202, self-approval 403, hard limit 403.
6. `npm run typecheck && npm run lint`. PR titled `app(<app>): …` touching only `src/apps/<app>/**`, `src/app/<app>/**`, tests.
   Do not touch `src/platform/**` in an app PR.

Full reference: `docs/BUILDING_APPS.md`. Worked examples: `src/apps/refunds` (HTTP write, approval thresholds),
`src/apps/flags` (DB write, per-environment approval), `src/apps/kyc-queue` (built via the builder; four-eyes on sanctions).
