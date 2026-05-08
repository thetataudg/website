import { NextResponse } from "next/server";
import { requireRole } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import { getMemberPassProfileById } from "@/lib/memberPassProfile";
import { findWalletPassByNfcMessage } from "@/lib/walletPassStore";

export const runtime = "nodejs";

function isSecretAuthorized(req: Request) {
  const expected = process.env.WALLET_NFC_API_SECRET?.trim();
  if (!expected) return false;
  return req.headers.get("x-wallet-nfc-secret") === expected;
}

export async function POST(req: Request) {
  if (!isSecretAuthorized(req)) {
    try {
      await requireRole(req as any, ["superadmin", "admin"]);
    } catch (err: any) {
      return NextResponse.json(
        { error: err?.message || "Unauthorized" },
        { status: err?.statusCode || 401 }
      );
    }
  }

  await connectDB();

  const body = await req.json().catch(() => null);
  const message = String(body?.message || "").trim();
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const passRecord = await findWalletPassByNfcMessage(message);
  if (!passRecord) {
    return NextResponse.json({ error: "NFC pass not found" }, { status: 404 });
  }

  const member = await getMemberPassProfileById(passRecord.memberId);
  if (!member) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  return NextResponse.json(
    {
      serialNumber: passRecord.serialNumber,
      passTypeIdentifier: passRecord.passTypeIdentifier,
      member: {
        memberId: member._id,
        rollNo: member.rollNo,
        name: `${member.fName} ${member.lName}`,
        status: member.status || "Active",
        major: member.majors?.[0] || null,
        majors: member.majors || [],
        minors: member.minors || [],
        gradYear: member.gradYear || null,
        familyLine: member.familyLine || null,
        pledgeClass: member.pledgeClass || null,
        committees: member.committees || [],
        hometown: member.hometown || null,
      },
    },
    { status: 200 }
  );
}
