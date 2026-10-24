import { NextResponse } from "next/server";
import { scaffoldApp } from "@/platform/scaffold";

// Dev-only convenience. In production the builder emits a PR, never writes to disk.
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "scaffold is disabled in production; open a PR" }, { status: 403 });
  try {
    const { yaml, force } = await req.json();
    return NextResponse.json(scaffoldApp(String(yaml ?? ""), { force: !!force }));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
