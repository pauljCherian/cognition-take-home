# Build-vs-buy recommendation: Devin-built internal-tools platform vs. Power Apps

**Recommendation: build the platform, but don't cancel Power Apps yet.** Migrate refunds and KYC onto the platform
in the next quarter as the proof, build the next 2–3 *new* tools on it, and let the Power Apps renewal be decided by
that evidence. Reversible, defensible, and it puts the decision on data the VP will actually have in 90 days.

## What the prototype showed (≈3 hours, incl. the builder)
- A capability manifest per app, enforced server-side (column/endpoint allowlists, writes only via named actions,
  role → approval → hard-limit → audit in one transaction) is buildable in hours, not weeks. Three apps run on it.
- App #3 (KYC queue) cost **~40 lines of manifest + ~40 lines of action code**, generated through the builder in minutes.
  The platform, not the app, carries authz, approvals, masking and audit. That is the "10 more apps" argument.
- The governance panel answers access-review questions Power Apps can't (who can read `customers.email`, across apps;
  SoD lint; drift; live denials) because the manifest is machine-readable policy, not documentation.
- Building the third app through the builder found three platform gaps immediately (multi-action writes, schema hot-reload,
  state checks at submit time). Expect this: the platform hardens with each app, which is why the first 2–3 must be real ones.

## Cost model (marginal, both sides)
| | Power Apps | Platform + Devin |
|---|---|---|
| Licenses | $250K/yr, grows with ops headcount | ~$0; hosting + ACUs ≈ $20–40K/yr |
| Year-1 build | consultants/Power Fx per app | platform hardening: SSO, Postgres roles, secrets, deploy, pen test ≈ 6–8 wks senior eng + Devin ≈ $90–130K |
| Per new app | days–weeks, in a canvas, outside code review | hours–days of Devin + engineer review of a manifest diff and ~100 lines |
| Recurring | configure + prove controls; connector breakage | own the system: deps, upgrades, on-call, access-review evidence ≈ 0.4–0.6 FTE ≈ $80–120K/yr |
| Compliance | MS attestations cover the platform | platform is in *your* SOC 2 / PCI scope; controls must be evidenced (the manifest + audit log are the evidence) |
| Exit | Dataverse migration | standard Next/Postgres, portable |

Year 1 roughly breaks even (build ≈ license). Year 2+ saves ~$100–150K/yr and the savings grow with ops headcount.
The honest risk is not dollars; it's **owning another production system that touches money**.

## Where Power Apps still wins
SSO/Dataverse/audit on day one, Microsoft's compliance posture, hundreds of connectors, non-engineers can change a form
without a PR, no on-call. If the ops team values self-service edits more than control depth, stay.

## Where the platform wins
Depth of control (per-column, per-endpoint, per-action, maker-checker by user id) that is *generated*, not assembled per app;
audit/SoD/access-review evidence as a by-product; no per-seat pricing; code review as the change-management control;
and the agent fear inverted: Devin operates inside a reviewed manifest it cannot exceed.

## Conditions on the "build" answer
1. Platform code gets product-grade review and a pen test before the refunds app goes live; the manifest schema is frozen behind
   resource-owner + security approval.
2. Real SSO (Okta/Entra groups → roles), per-app Postgres roles compiled from manifests, secrets manager, prod `scaffold` disabled.
3. A named owning team (platform or payments-infra) with the 0.5 FTE budgeted; no orphan apps.
4. Flags: don't rebuild LaunchDarkly. Keep the admin panel thin (it was the cheapest app) or buy.
5. Decide the renewal after two migrated apps have passed an internal access review on the platform.

## Open questions that could flip this
- Where is the data today? If it lives in Dataverse, migration cost belongs in Year 1 and may justify a slower, hybrid path.
- Does ops need to self-edit tools weekly? That is the one capability this design deliberately gives up.
- Is there appetite for a Series C eng org to run a second regulated system, or would a Retool/Appsmith + Devin hybrid be the better middle?
