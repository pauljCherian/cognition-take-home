import { NextResponse } from "next/server";
import { ROLES } from "@/platform/manifest";
import { RESOURCE_CATALOG } from "@/platform/resources";

export async function GET() {
  return NextResponse.json({ catalog: RESOURCE_CATALOG, roles: ROLES });
}
