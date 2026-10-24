import { NextResponse } from "next/server";
import { decide } from "@/platform/engine";
import { errorResponse, requestActor } from "@/platform/http";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json().catch(() => ({}));
    const result = await decide(params.id, requestActor(req), body.decision === "reject" ? "reject" : "approve", String(body.reason ?? ""));
    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
