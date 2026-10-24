# internal-tools-platform

Prototype of a manifest-governed internal-tools platform (Power Apps replacement for a fintech),
built with Next.js + TypeScript + SQLite. See `docs/NOTES.md` for the reasoning and
`docs/DEVIN_PLAYBOOK.md` for how Devin adds an app.

```
npm install && npm run dev      # http://localhost:3000
```

Layout
- `src/platform/`  manifest schema/loader, resource enforcement, Action/approval/audit engine, governance queries
- `src/apps/<app>/manifest.yaml`  what the app may read / write / do (reviewed like a permission change)
- `src/apps/<app>/actions.ts`     action implementations, only see scoped connectors
- `src/app/`       UI: apps, approval inbox, audit log, governance panel; API routes under `src/app/api`

Demo script
1. As Sam (support) open Refunds, refund $20 on `pay_8f3a` → executed, audit row.
2. Refund $1,500 on `pay_91cc` → pending (amount > $500). Switch to Frank (finance approver) → Approvals → approve.
3. Switch back to Sam and try to approve your own request → 403 self-approval, logged.
4. "Try to bypass the UI": raw `POST /v1/refunds`, read `customers.ssn_last4`, $20k refund → all 403, all in Governance → Denials.
5. Switch to Erin (engineer): Flags → turn on `instant_payouts` in dev (immediate), in prod (pending; Eli approves). Kill switch is immediate.
6. Governance: per-app capabilities, inverted per-column view, per-user access review, SoD lint, drift, denials, manifest history.
7. Edit `src/apps/refunds/manifest.yaml`, remove `card_last4` from `payments` → refunds page fails closed with a logged denial.
