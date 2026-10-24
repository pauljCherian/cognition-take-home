# Design notes

## Why a fintech is not the median Power Apps customer
Power Apps is built for forms over SharePoint lists and PTO approvals: broad connector catalogue,
citizen developers, CRUD semantics. A Series C fintech's internal tools differ in kind:

| Generic Power Apps need | Fintech internal-tool need |
|---|---|
| CRUD on records | Irreversible, money-moving **Actions** (refund, ledger adjust, KYC decision) |
| "Who edited this row" | Regulator-facing reconstruction: actor, reason code, evidence seen, policy version, second reviewer |
| Approvals as a nice-to-have workflow | Segregation of duties as a legal control (SOC 2 CC6, SOX ITGC, PCI 7/8) |
| No data-classification constraints | PANs, SSNs, ID docs: field-level masking, keep the tool out of PCI scope |
| 1000+ connectors to Office/Dynamics | A handful of money-semantics APIs (Stripe/Adyen, Alloy/Persona, ledger) they would write connectors for anyway |
| Citizen developers | 60 engineers; ops staff should not assemble money-moving flows without code review |
| Stable seat count | Ops/compliance headcount grows faster than engineering; per-seat pricing scales against them |

Net: Power Apps sells *breadth*; a fintech needs *depth* on a narrow set of controls over its own APIs.

## "Internal only" does not lower the bar; it moves it
It relaxes perimeter, availability, scale and polish. It does not relax authorization, audit, dual
control or masking — internal tools are where the money moves and the PII lives, and auditors scope
by data, not by audience. Threat model shifts from anonymous attacker to privileged insider + mistake.

## Manifest vs Power Apps DLP
Power Apps' governance analog is Data Loss Prevention policies: environment-wide allow/block lists of
*connectors*. They cannot express "this app may read `customers.email` but not `customers.ssn_last4`",
"writes to Stripe only via `refund.issue`", or "approval above $500". The manifest is per-app,
per-table, per-column, per-endpoint, per-action, and it is enforced at runtime (fail closed, every
denial logged) rather than being documentation. It is also the thing a reviewer actually reads: a
30-line permission diff instead of 800 lines of generated UI.

## Why this is the right shape for Devin specifically
The manifest is a contract the agent cannot exceed. The trust question moves from "do we trust the
generated code?" to "do we trust this manifest?", which a human reviews in minutes. The playbook
reads the manifest to know exactly what to generate, including the policy tests.

## Prototype: real vs stubbed
Real: manifest schema + loader, column/endpoint allowlists with denial logging, Action runtime
(role → input → hard limits → approval predicate), approval inbox with maker≠checker, append-only
audit in the same transaction (DB triggers block UPDATE/DELETE), PII masking by role, idempotent
refund execution, governance panel (7 views), two apps from two manifests.
Stubbed: SSO (actor switcher; prod = OIDC groups → roles), Stripe (in-process mock), Postgres
(SQLite; prod = per-app DB role with grants compiled from the manifest + RLS), HTTP allowlist proxy
(in-process), notifications, environments, CI/SAST, hosting.
