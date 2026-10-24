import { GenericApp } from "@/components/GenericApp";
import { getActor } from "@/platform/identity";
import { getManifest } from "@/platform/manifest";

// Auto-generated. Replace with a bespoke UI when the generic table/form view is not enough;
// keep using query()/invoke() via the API so the manifest stays the boundary.
export default function Page() {
  return <GenericApp manifest={getManifest("kyc-queue")} actor={getActor()} />;
}
