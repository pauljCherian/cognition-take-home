# Demo script, Power Apps contrast, and "how you'd do this in your own environment"

Three things in one file: (1) a 2–3 minute shot-by-shot demo of the platform, (2) how it differs from Power Apps,
(3) the concrete steps a team would follow to build this with Devin against their own data. The demo is the middle
of the 5-minute VP video; beats 1 (Power Apps), 3–5 (assessment, recommendation, next steps) wrap around it and are
summarised at the end.

---

## 1. Demo video script (≈2:45)

Setup before recording: `npm run dev`, actor = **Sam (support)**, browser at `/refunds`, DB freshly seeded
(`rm data/*.db` if it exists, restart). Window ~1440 wide so the action panel sits under the table.

| t | On screen | Say |
|---|---|---|
| 0:00 | `/refunds`, Apps workspace, indigo | "This is one of the three apps — the refunds dashboard — running on a platform we built, not on Power Apps. Two things to notice before I click anything: the sidebar shows two apps Sam *can't* open, greyed, and the email column is masked. Neither is app code. Both come from a 40-line file." |
| 0:15 | Split: open `src/apps/refunds/manifest.yaml` next to the browser | "Every app has a capability manifest: what it may read, down to the column — note `card_pan` and `ssn_last4` aren't here — what it may write, and the only action allowed to perform that write. Anything not in this file is unreachable at runtime, not just hidden in the UI." |
| 0:35 | Click **Refund…** on `pay_8f3a`, $20, reason `duplicate` → executed | "Small refund: role checked, input typed, under the hard limit, no approval predicate hit — executes, audit row written in the same transaction." |
| 0:50 | Refund $1,500 on `pay_91cc` → **pending** | "Over $500: the manifest says this needs a `finance_approver`. Sam can't approve it himself —" switch actor to Sam-approve attempt if time, else skip "— maker-checker is by user id, not just role." |
| 1:05 | Switch actor → **Frank (finance approver)** → Approval inbox → approve | "Frank sees the request with the snapshot Sam saw, approves. Refund goes to the processor, audit shows both actors." |
| 1:20 | Back to Sam → expand **Try to bypass the UI** → run the three: raw `POST /v1/refunds`, read `customers.ssn_last4`, $20k refund → three 403s | "Now the part that matters for a fintech. Skip the UI entirely and call the API: direct Stripe write — denied, undeclared endpoint. Read an undeclared column — denied. $20k — denied, hard ceiling no approval can override. Each one is logged." |
| 1:40 | Toggle → **Governance** (emerald) → Denied attempts | "Governance is the second workspace, for security and auditors. Here are the three attempts we just made, with actor and what they tried." |
| 1:50 | Governance → Data access by column, hover `customers.email` | "This view inverts the manifests: *who can read this column, across every app*. That's the access-review question that normally takes a week in a spreadsheet; here it's generated." |
| 2:00 | Governance → Segregation of duties | "And the platform lints the manifests: if a role can both request and approve the same action, it flags it before the app ships." |
| 2:10 | **+ New app (manifest builder)** → load the `disputes` example (or type: app `disputes`, read `db.payments.disputes`, action `dispute.close`) → right pane shows YAML, validation, governance preview | "App number four. Pick tables and columns from the catalog, declare the action and its approval rule. The manifest, validation and governance preview update live. Click scaffold —" |
| 2:30 | Scaffold → **Open /disputes** → generic table + form render | "— and the app exists, with a working table and form. The action still says TODO. That TODO is the only thing Devin writes: copy the prompt from this tab, it gets the manifest plus the contract, implements ~15 lines, opens a PR. Devin can't reach anything outside the manifest even if it tries." |
| 2:45 | Governance → Apps & capabilities, disputes listed | "And it's already in the governance view, because the manifest *is* the policy. Ten more apps is ten more of these files." |

Cut. If you need to hit 2:00, drop the SoD step (2:00) and the Frank approval (1:05, say "Frank approves it" over the pending badge).

Pre-recorded fallback: `disputes-dashboard-demo-edited.mp4` (3:48) covers 2:10–2:45 in full including the Devin implementation step.

---

## 2. How this differs from Power Apps — said plainly

**One sentence:** Power Apps starts from a screen and lets you reach whatever the connector credential allows;
this platform starts from a declaration of what the app may touch, generates the screen, and makes everything else
unreachable.

| | Power Apps | This platform |
|---|---|---|
| You start by… | dragging controls onto a canvas, binding to a data source | writing (or clicking together) a manifest: reads, writes, actions, roles, approvals, PII |
| UI | hand-built per app in Power Fx; its real strength | generated from the manifest; bespoke only if needed (refunds page is bespoke, KYC and flags are generic) |
| Data scoping | connector credential + Dataverse security roles; DLP policies allow/block *connectors* per environment | per **app**, per **table**, per **column**, per **endpoint**; deny by default; enforced server-side, every denial logged |
| Writes | any screen can `Patch()` whatever the connection allows | only through a named action with typed input, role check, approval predicate, hard limit, mandatory reason, idempotency |
| Approvals | assembled per app in Power Automate | a policy line on the action (`requires_approval_when`); maker ≠ checker by user id, enforced centrally |
| Audit | Dataverse auditing per table, if enabled; app-level logging is yours to build | append-only, same transaction as the write, actor + reason + snapshot; DB triggers block edits |
| Change control | maker edits in studio and publishes; version history per save; ALM optional | git PR; manifest diff = permission review (resource owner + security), code diff = normal review |
| Who builds | citizen developers / ops staff | engineers and coding agents; ops staff *use*, they don't edit |
| Access review evidence | export from admin center + Dataverse roles, reconciled by hand | generated: who-can-read-what, per user, per column, SoD lint, drift vs. actual grants |
| Compliance posture | Microsoft's attestations cover the platform | the platform is inside *your* SOC 2 / PCI scope; manifest + audit log are the evidence |
| Cost model | per seat ($250K/yr, grows with ops headcount) | hosting + ACUs + ~0.5 FTE ownership |
| What you give up | — | non-engineers editing a form in 5 minutes; 1000+ connectors; no on-call |

The honest framing: Power Apps sells breadth and self-service; a fintech's internal tools need depth on a narrow set
of controls over a handful of its own APIs. If the ops team's real need is "tweak the form weekly without engineering",
stay on Power Apps. If it's "move money and PII under controls an auditor can read", this shape wins.

---

## 3. How a team would actually use Devin to build this in their own environment

What the prototype stubs (SSO, Postgres, Stripe, deploy) is exactly the part a real team does first. The sequence below
is what we'd put in front of the VP as the 6–8 week plan. "Devin" = coding-agent sessions driven from the repo;
"Eng" = one senior engineer owning the platform; "Owner" = resource owner / security for permission review.

### Phase 0 — Fork and decide the boundary (Eng, day 1)
1. Fork this repo (or start fresh and lift `src/platform/`). Everything under `src/platform/` is the platform; everything
   under `src/apps/` and `src/app/<app>/` is an app. That line is the whole governance story — keep it.
2. Write down the **resource catalog** for real: which Postgres schemas/tables, which vendor APIs (Stripe/Adyen, Alloy/Persona,
   LaunchDarkly, Zendesk), who owns each. This becomes `RESOURCE_CATALOG` in `src/platform/resources.ts` and is what the builder
   offers. Devin can draft it from your schema dump; a human confirms owners.

### Phase 1 — Replace the four stubs (Eng + Devin, weeks 1–3)
Each is a Devin task scoped to `src/platform/**`, reviewed by Eng. Suggested prompts:
- **Identity.** "Replace `src/platform/identity.ts` actor cookie with OIDC (Okta/Entra). Map IdP groups → platform roles via a
  config file. Keep the `Actor` type unchanged so apps don't change." Roles stay the vocabulary the manifests already use.
- **Postgres + physical grants.** "Replace SQLite with Postgres. Add a `compile-grants` script that reads every manifest and
  emits `CREATE ROLE app_<name>` + `GRANT SELECT (cols) ON table` + RLS policies from `row_filter`. `ctx.db` connects as the
  app's role." This turns the prototype's statement-parsing `scopedDb()` into database-enforced grants — the single most
  important hardening step. The governance **drift** view then compares manifest vs. `information_schema` grants.
- **Connectors + secrets.** "Implement `stripe` and `kyc_vendor` connectors behind the existing `HttpWriter` allowlist, credentials
  from Vault/AWS Secrets Manager, idempotency key passed through, actor id forwarded as metadata." One connector per vendor,
  ~100 lines each; they're written once and every app reuses them.
- **Deploy.** Container on your existing platform (ECS/Fly/K8s), behind the SSO proxy, `NODE_ENV=production` so `scaffold` is a
  403, Postgres with the audit triggers, log shipping for `audit_log` and `denials`.

### Phase 2 — Make "new app" a PR, not a disk write (Eng + Devin, week 3)
- Builder's **Scaffold** button opens a branch containing only `src/apps/<app>/manifest.yaml` and a PR titled
  `manifest(<app>): …`. CODEOWNERS routes `src/apps/*/manifest.yaml` to the resource owners + security.
- On merge, a GitHub Action (or Devin automation) runs `npm run new-app -- --from` the merged manifest and opens a second PR
  with the scaffolded `actions.ts` + page, assigned to Devin with the generated prompt. That PR can only touch `src/apps/<app>/**`
  and `src/app/<app>/**` — enforce with CODEOWNERS/path filter so an app PR can't widen platform code.
- CI runs the five policy tests per app (allowed / wrong role / approval 202 / self-approval 403 / hard-limit 403) plus
  `compile-grants --check` so a manifest and the DB can't disagree.

### Phase 3 — Migrate the first real app: refunds (weeks 4–5)
1. Owner + Eng write the refunds manifest from the real schema in `/builder` (this is the hour that matters; it decides
   PCI scope — e.g. `card_last4` yes, `card_pan` no).
2. Manifest PR → reviewed by payments-data owner + security → merged → grants compiled.
3. Devin PR: implements `execute()` against the real Stripe connector, tests, bespoke UI only if the generic one isn't enough.
4. Shadow for a week: ops uses both; compare audit log to Power Apps history. Then cut over.

### Phase 4 — KYC, then new apps (weeks 5–8)
KYC follows the same path (vendor connector first). Then the next *new* tool is built platform-first — that's where the
"10 more apps" claim gets tested: target is manifest reviewed in a day, Devin PR in a day, live by end of week.
Keep flags thin or on LaunchDarkly; it was the cheapest app and the least worth rebuilding.

### Day-to-day after that
- **Ops staff** use `/apps`. They never touch the builder.
- **An engineer or PM** who wants app #N opens `/builder`, declares the box, opens the manifest PR.
- **Resource owner + security** review ~30 lines of YAML. That is the permission decision; it's the only review that needs a
  domain expert.
- **Devin** gets the generated prompt + `AGENTS.md`, implements the action, adds the tests, opens the app PR. It can't read a
  column, hit an endpoint, or write a table the manifest didn't grant, so the review of its code is a normal code review, not a
  security review.
- **Auditors** get Governance: who can read what, SoD, drift, denials, manifest history — generated, exportable, no spreadsheet.
- **Platform owner (0.4–0.6 FTE)**: dependency upgrades, connector breakage, on-call for the shared service, quarterly review of
  `denials` for patterns.

### Where Devin specifically earns its keep
- Writing the four Phase-1 replacements against a clear interface (`Actor`, `HttpWriter`, `ctx.db`) — well-bounded, testable.
- Every app's `actions.ts` + tests from a manifest it cannot exceed.
- Connectors: one per vendor, from the vendor's OpenAPI spec, behind the allowlist.
- Maintenance: dependency bumps, "add a column to the disputes read" (manifest change → human review → Devin updates query + tests).
- The thing it should *not* do unsupervised: edit `src/platform/**` or any manifest. Those are the two places a human decides.

---

## 4. Slotting the demo into the 5-minute VP video

| Beat | Time | Content |
|---|---|---|
| 1. What matters in Power Apps | 0:00–0:45 | Fast UI over a data source, SSO/Dataverse/audit on day one, non-engineers edit live, Microsoft's compliance posture. Its weakness for *you*: governance is connector-level DLP, approvals are hand-assembled, per-seat pricing scales with ops headcount, changes bypass code review. |
| 2. Demo | 0:45–3:30 | Section 1 above (trim to 2:45). |
| 3. Honest assessment | 3:30–4:15 | Replicable: the three apps' behaviour, plus controls Power Apps can't express. Not replicable cheaply: 1000 connectors, non-engineer self-service, zero on-call, Microsoft's attestations. Risk: owning a second production system that touches money; the manifest is only as good as its review; SSO/Postgres/connectors are the real 6–8 weeks. ~3h spent; core in ~2h, builder/tests in a second pass. |
| 4. Recommendation | 4:15–4:40 | Build the platform; don't cancel Power Apps yet. Migrate refunds + KYC, build next 2–3 new tools here, decide renewal on that evidence. Year 1 ≈ break-even, Year 2+ saves ~$100–150K, savings grow with ops headcount. |
| 5. Next steps | 4:40–5:00 | Section 3 phases 0–3. Devin: Phase-1 replacements, every app's actions + tests, connectors. Humans: resource catalog, every manifest review, platform code review, pen test. |
