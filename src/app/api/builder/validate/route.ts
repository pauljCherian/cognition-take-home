import { NextResponse } from "next/server";
import { devinPrompt, validateManifestYaml } from "@/platform/scaffold";

export async function POST(req: Request) {
  const { yaml } = await req.json();
  const v = validateManifestYaml(String(yaml ?? ""));
  return NextResponse.json({ ...v, prompt: devinPrompt(String(yaml ?? "")) });
}
