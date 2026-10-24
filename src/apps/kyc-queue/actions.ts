import type { AppModule } from "@/platform/engine";
import { db, nowIso } from "@/platform/db";
import { DeniedError } from "@/platform/errors";

// KYC review queue — built from the manifest via `npm run new-app`; only the three TODOs were filled in.
// Role, input, approval (four-eyes on sanctions hits and rejections) and the audit row are the platform's job.
type CaseRow = { id: string; status: string; sanctions_hit: number; assigned_to: string | null; decided_at: string | null };
const getCase = (id: string) => db().prepare("SELECT id, status, sanctions_hit, assigned_to, decided_at FROM kyc_cases WHERE id = ?").get(id) as CaseRow | undefined;

export const actions: AppModule["actions"] = {
  "kyc.decide": {
    context(input) {
      const c = getCase(String(input.case_id));
      return { sanctions_hit: !!c?.sanctions_hit };
    },
    before(input) {
      const c = getCase(String(input.case_id));
      if (!c) throw new DeniedError("state", `case ${input.case_id} not found`);
      if (c.status !== "open" && c.status !== "escalated") throw new DeniedError("state", `case ${c.id} is already ${c.status}`);
      return c;
    },
    execute(ctx, input) {
      const status = input.decision === "approve" ? "approved" : input.decision === "reject" ? "rejected" : "escalated";
      const decided = status === "escalated" ? null : nowIso();
      ctx.db
        .prepare("UPDATE kyc_cases SET status = ?, decided_at = ?, decision_reason = ? WHERE id = ?")
        .run(status, decided, `${input.reason_code}: ${ctx.reason}`, input.case_id);
      return { case_id: input.case_id, status, decided_by: ctx.actor.id };
    },
  },
  "kyc.assign": {
    before(input) {
      const c = getCase(String(input.case_id));
      if (!c) throw new DeniedError("state", `case ${input.case_id} not found`);
      return { assigned_to: c.assigned_to };
    },
    execute(ctx, input) {
      ctx.db.prepare("UPDATE kyc_cases SET assigned_to = ? WHERE id = ?").run(input.assignee, input.case_id);
      return { case_id: input.case_id, assigned_to: input.assignee };
    },
  },
};
