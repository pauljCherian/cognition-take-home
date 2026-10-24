#!/usr/bin/env bash
# Policy smoke test for an app: proves allowed / wrong-role / approval / self-approval / limit-or-state / read-scope.
# usage: scripts/smoke.sh refunds|kyc-queue   (dev server on :3000)
set -u
B=${BASE:-http://localhost:3000}; H='content-type: application/json'
call() { # actor method path body
  local out; out=$(curl -s -o /tmp/smoke.body -w '%{http_code}' -X "$2" "$B$3" -H "$H" -H "x-actor: $1" -d "$4"); echo "$out $(cat /tmp/smoke.body | head -c 160)"; }
expect() { local label=$1 want=$2; shift 2; local got; got=$(call "$@"); [[ $got == $want* ]] && echo "PASS $label → $got" || echo "FAIL $label (want $want) → $got"; }
req_id() { python3 -c 'import sys,json;print(json.load(open("/tmp/smoke.body")).get("requestId",""))'; }

case ${1:-refunds} in
refunds)
  expect "allowed low refund"        200 u_sam  POST /api/actions/refunds/refund.issue '{"payment_id":"pay_8f3a","amount_cents":100,"reason_code":"duplicate","reason":"smoke"}'
  expect "wrong role"                403 u_erin POST /api/actions/refunds/refund.issue '{"payment_id":"pay_91cc","amount_cents":100,"reason_code":"duplicate","reason":"smoke"}'
  expect "approval predicate"        202 u_sam  POST /api/actions/refunds/refund.issue '{"payment_id":"pay_91cc","amount_cents":150000,"reason_code":"duplicate","reason":"smoke"}'
  R=$(req_id)
  expect "self-approval blocked"     403 u_sam   POST "/api/approvals/$R" '{"decision":"approve"}'
  expect "approver executes"         200 u_frank POST "/api/approvals/$R" '{"decision":"approve","reason":"ok"}'
  expect "hard limit"                403 u_fiona POST /api/actions/refunds/refund.issue '{"payment_id":"pay_8f3a","amount_cents":2000000,"reason_code":"duplicate","reason":"smoke"}'
  expect "undeclared column read"    403 u_sam  POST /api/query/refunds '{"resource":"db.payments","table":"customers","columns":["id","ssn_last4"]}'
  expect "raw connector write"       403 u_fiona POST /api/resources/refunds/stripe '{"method":"POST","path":"/v1/refunds"}'
  ;;
kyc-queue)
  expect "allowed assign"            200 u_kai  POST /api/actions/kyc-queue/kyc.assign '{"case_id":"kyc_303","assignee":"u_kai"}'
  expect "wrong role"                403 u_sam  POST /api/actions/kyc-queue/kyc.assign '{"case_id":"kyc_303","assignee":"u_sam"}'
  expect "four-eyes on sanctions"    202 u_kai  POST /api/actions/kyc-queue/kyc.decide '{"case_id":"kyc_302","decision":"approve","reason_code":"sanctions_false_positive","reason":"smoke"}'
  R=$(req_id)
  expect "self-approval blocked"     403 u_kai  POST "/api/approvals/$R" '{"decision":"approve"}'
  expect "second analyst approves"   200 u_kim  POST "/api/approvals/$R" '{"decision":"approve","reason":"checked list entry"}'
  expect "already decided → state"   403 u_kai  POST /api/actions/kyc-queue/kyc.decide '{"case_id":"kyc_302","decision":"reject","reason_code":"docs_illegible","reason":"smoke"}'
  expect "undeclared column read"    403 u_kai  POST /api/query/kyc-queue '{"resource":"db.kyc","table":"kyc_documents","columns":["id","ocr_id_number"]}'
  ;;
*) echo "unknown app $1"; exit 2;;
esac
