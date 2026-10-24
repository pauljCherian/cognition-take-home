import { NextResponse } from "next/server";
import { errorResponse, requestActor } from "@/platform/http";
import { getManifest } from "@/platform/manifest";
import { query } from "@/platform/resources";

// Reads go through the same allowlist as the UI. Try asking for customers.ssn_last4 — it 403s and is logged.
export async function POST(req: Request, { params }: { params: { app: string } }) {
  try {
    const spec = await req.json();
    return NextResponse.json({ rows: query(getManifest(params.app), requestActor(req), spec) });
  } catch (e) {
    return errorResponse(e);
  }
}
