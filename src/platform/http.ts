import { NextResponse } from "next/server";
import { DeniedError } from "./errors";
import { actorFromHeader, getActor, type Actor } from "./identity";

/** Actor from cookie (browser) or X-Actor header (raw API call demo). */
export function requestActor(req: Request): Actor {
  return actorFromHeader(req.headers.get("x-actor")) ?? getActor();
}

export function errorResponse(e: unknown) {
  if (e instanceof DeniedError) {
    return NextResponse.json({ error: e.message, kind: e.kind, denied: true }, { status: 403 });
  }
  return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
}
