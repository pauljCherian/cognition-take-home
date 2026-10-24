import { NextResponse } from "next/server";
import { invoke } from "@/platform/engine";
import { errorResponse, requestActor } from "@/platform/http";

export async function POST(req: Request, { params }: { params: { app: string; action: string } }) {
  try {
    const body = await req.json().catch(() => ({}));
    const { reason, ...input } = body ?? {};
    const result = await invoke(params.app, params.action, requestActor(req), input, String(reason ?? ""));
    return NextResponse.json(result, { status: result.status === "pending" ? 202 : 200 });
  } catch (e) {
    return errorResponse(e);
  }
}
