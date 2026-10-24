import { getActor } from "@/platform/identity";
import { getManifest } from "@/platform/manifest";
import { query } from "@/platform/resources";
import { FlagsClient } from "./FlagsClient";

export default function FlagsPage() {
  const actor = getActor();
  const m = getManifest("flags");
  if (!m.roles_with_access.includes(actor.role)) {
    return <div className="card text-sm">Role <span className="tag-role">{actor.role}</span> is not in <code>roles_with_access</code> for flags.</div>;
  }
  const flags = query(m, actor, { resource: "db.flags", table: "feature_flags", columns: ["key", "environment", "enabled", "rollout_pct", "description", "updated_at"], orderBy: "key" });
  return (
    <>
      <div className="flex items-baseline justify-between">
        <h1>{m.title}</h1>
        <span className="text-xs text-neutral-500">manifest: src/apps/flags/manifest.yaml · prod changes need a second engineer</span>
      </div>
      <FlagsClient flags={flags} canAct={m.actions["flag.set"].can_act.includes(actor.role)} />
    </>
  );
}
