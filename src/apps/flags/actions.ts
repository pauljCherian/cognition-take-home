import type { AppModule } from "@/platform/engine";
import { db } from "@/platform/db";

export const actions: AppModule["actions"] = {
  "flag.set": {
    before(input) {
      return db().prepare("SELECT key, environment, enabled, rollout_pct FROM feature_flags WHERE key = ? AND environment = ?").get(input.key, input.environment);
    },
    execute(ctx, input) {
      const r = ctx.db
        .prepare("UPDATE feature_flags SET enabled = ?, rollout_pct = ?, updated_at = datetime('now') WHERE key = ? AND environment = ?")
        .run(input.enabled ? 1 : 0, input.rollout_pct, input.key, input.environment);
      if (r.changes === 0) throw new Error("no such flag/environment");
      return { key: input.key, environment: input.environment, enabled: !!input.enabled, rollout_pct: input.rollout_pct };
    },
  },
  "flag.kill": {
    before(input) {
      return db().prepare("SELECT environment, enabled, rollout_pct FROM feature_flags WHERE key = ?").all(input.key);
    },
    execute(ctx, input) {
      const r = ctx.db.prepare("UPDATE feature_flags SET enabled = 0, rollout_pct = 0, updated_at = datetime('now') WHERE key = ?").run(input.key);
      if (r.changes === 0) throw new Error("no such flag");
      return { key: input.key, killed_in_envs: r.changes };
    },
  },
};
