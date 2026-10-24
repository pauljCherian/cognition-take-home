import { ROLES } from "@/platform/manifest";
import { RESOURCE_CATALOG } from "@/platform/resources";
import { BuilderClient } from "./BuilderClient";

export default function BuilderPage() {
  return (
    <>
      <div className="flex items-baseline justify-between">
        <h1>App builder</h1>
        <span className="text-xs text-neutral-500">compose a manifest from the catalog → validate → scaffold or hand to Devin · docs: AGENTS.md, docs/BUILDING_APPS.md</span>
      </div>
      <BuilderClient catalog={RESOURCE_CATALOG} roles={[...ROLES]} />
    </>
  );
}
