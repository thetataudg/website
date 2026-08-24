import { NextResponse } from "next/server";
import { buildAppleAppSiteAssociation } from "@/lib/appleAppSiteAssociation";

export const runtime = "nodejs";

export function GET() {
  return NextResponse.json(buildAppleAppSiteAssociation(), {
    headers: {
      "Cache-Control": "public, max-age=300",
      "Content-Type": "application/json",
    },
  });
}
