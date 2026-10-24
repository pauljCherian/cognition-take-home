import { listRequests } from "@/platform/engine";
import { getActor } from "@/platform/identity";
import { loadManifests } from "@/platform/manifest";
import { ApprovalsClient } from "./ApprovalsClient";

export default function ApprovalsPage() {
  const actor = getActor();
  const approverFor: Record<string, boolean> = {};
  for (const m of loadManifests()) for (const [a, s] of Object.entries(m.actions)) approverFor[`${m.app}:${a}`] = s.approvers.includes(actor.role);
  return (
    <>
      <h1>Approval inbox</h1>
      <ApprovalsClient requests={listRequests()} actorId={actor.id} approverFor={approverFor} />
    </>
  );
}
