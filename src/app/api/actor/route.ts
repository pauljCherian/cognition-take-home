import { NextResponse } from "next/server";
import { ACTOR_COOKIE, USERS } from "@/platform/identity";

export async function POST(req: Request) {
  const { id } = await req.json();
  if (!USERS.some((u) => u.id === id)) return NextResponse.json({ error: "unknown user" }, { status: 400 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ACTOR_COOKIE, id, { path: "/", httpOnly: true, sameSite: "lax" });
  return res;
}
