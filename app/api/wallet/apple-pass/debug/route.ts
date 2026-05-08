import { NextResponse } from "next/server";
import { requireRole } from "@/lib/clerk";
import { getAppleWalletCertDiagnostics } from "@/lib/appleWalletPass";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await requireRole(req as any, ["superadmin", "admin"]);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Unauthorized" },
      { status: err?.statusCode || 401 }
    );
  }

  const diagnostics = await getAppleWalletCertDiagnostics();
  return NextResponse.json(diagnostics, { status: 200 });
}
