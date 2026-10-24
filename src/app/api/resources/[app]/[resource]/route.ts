import { errorResponse, requestActor } from "@/platform/http";
import { getManifest } from "@/platform/manifest";
import { rawResourceCall } from "@/platform/resources";

// "Can I just call Stripe directly from the app / from curl?" No. Writes exist only inside Actions.
export async function POST(req: Request, { params }: { params: { app: string; resource: string } }) {
  try {
    const body = await req.json().catch(() => ({}));
    rawResourceCall(getManifest(params.app), requestActor(req), params.resource, String(body.method ?? "POST"), String(body.path ?? "/"));
  } catch (e) {
    return errorResponse(e);
  }
}
