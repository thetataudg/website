import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import logger from "@/lib/logger";
import { createAppleWalletPass, getAppleWalletPassIdentifiers } from "@/lib/appleWalletPass";
import { getMemberPassProfileByClerkId } from "@/lib/memberPassProfile";
import { ensureWalletPassRecord } from "@/lib/walletPassStore";
import {
  parseAssociatedStoreIdentifiers,
  shouldEnableAppleWalletAppLinks,
  shouldEnableAppleWalletUpdates,
} from "@/lib/appleWalletConfig";
import { absoluteUrl } from "@/lib/siteUrl";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const clerkId = await requireAuth(req as any);
    await connectDB();

    const member = await getMemberPassProfileByClerkId(clerkId);
    if (!member) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    if (member.status && member.status !== "Active") {
      return NextResponse.json(
        { error: "Only active members can add this pass to Apple Wallet" },
        { status: 403 }
      );
    }

    const { identifiers } = await getAppleWalletPassIdentifiers();
    const passRecord = await ensureWalletPassRecord({
      memberId: member._id,
      passTypeIdentifier: identifiers.passTypeIdentifier,
    });

    const nfcEncryptionPublicKey = process.env.APPLE_WALLET_NFC_PUBLIC_KEY?.trim();
    const associatedStoreIdentifiers = parseAssociatedStoreIdentifiers();
    const updatesEnabled = shouldEnableAppleWalletUpdates(req.url);
    const appLinksEnabled = shouldEnableAppleWalletAppLinks();
    const pass = await createAppleWalletPass(member, {
      identifiers,
      serialNumber: passRecord.serialNumber,
      authenticationToken: updatesEnabled ? passRecord.authenticationToken : undefined,
      webServiceURL: updatesEnabled
        ? absoluteUrl("/api/wallet/apple-pass/v1")
        : undefined,
      nfcMessage: nfcEncryptionPublicKey ? passRecord.nfcMessage : undefined,
      nfcEncryptionPublicKey,
      nfcRequiresAuthentication:
        process.env.APPLE_WALLET_NFC_REQUIRES_AUTHENTICATION === "true",
      appLaunchURL: appLinksEnabled
        ? process.env.APPLE_WALLET_APP_LAUNCH_URL?.trim() || undefined
        : undefined,
      associatedStoreIdentifiers:
        appLinksEnabled && associatedStoreIdentifiers.length > 0
          ? associatedStoreIdentifiers
          : undefined,
    });

    return new NextResponse(pass.buffer, {
      status: 200,
      headers: {
        "Content-Type": pass.contentType,
        "Content-Disposition": `attachment; filename="${pass.fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    logger.error({ err }, "Failed to generate Apple Wallet pass");
    return NextResponse.json(
      { error: err?.message || "Failed to generate Apple Wallet pass" },
      { status: 500 }
    );
  }
}
