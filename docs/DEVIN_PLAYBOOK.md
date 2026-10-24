> Superseded by [`AGENTS.md`](../AGENTS.md) (short contract) and [`BUILDING_APPS.md`](BUILDING_APPS.md) (full reference). The scaffolder `npm run new-app` and the `/builder` page replace the manual steps below; kept for history.

# Playbook: build a new internal tool on the platform

Input: a capability manifest at `src/apps/<app>/manifest.yaml`, written and reviewed by a human
(resource owner + security sign off on `reads`/`writes`/`actions`; nothing else needs their review).

## Steps

1. Read `src/platform/resources.ts` (`RESOURCE_CATALOG`) and the manifest. Every table, column and
   endpoint you touch must appear in the manifest. If the task needs something the manifest does not
   grant, **stop and ask** — do not widen the manifest yourself.
2. Create `src/apps/<app>/actions.ts` exporting `actions: AppModule["actions"]`, one entry per action
   declared in the manifest:
   - `context(input)` returns any facts named by `requires_approval_when` conditions (`context:` keys).
   - `before(input)` returns the state snapshot to store in the audit row.
   - `execute(ctx, input)` performs the write using only `ctx.http(resource)` (allowlisted to this
     action) or `ctx.db` for tables listed under `writes`. Use `ctx.requestId` as the idempotency key.
3. Register the app in `src/platform/engine.ts` `modules` map.
4. Create `src/app/<app>/page.tsx` (server component) that loads data with `query(manifest, actor, …)`
   using only manifest columns, and a `<App>Client.tsx` that calls `/api/actions/<app>/<action>`.
   Do not hide buttons as a security measure; the API is the boundary. Show the `ActionResult`.
5. Add tests for each action: allowed role executes; disallowed role 403s and a denial row exists;
   approval predicate produces `pending`; requester cannot approve own request; hard limit 403s.
6. Open a PR. Title: `app(<app>): <summary>`. The PR must not modify `src/platform/**` or any other
   app's manifest; if it does, split it and request platform + security review.

## What you get for free (do not reimplement)
SSO/actor resolution, role checks, input validation from the manifest, hard limits, approval queue
with maker≠checker, same-transaction append-only audit, PII masking, denial logging, governance panel.

## Example run
`flags` was produced from this playbook: 1 manifest (40 lines), 1 actions module (35 lines),
1 page + 1 client component (~90 lines). Everything on the governance panel updated automatically.
