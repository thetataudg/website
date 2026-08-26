import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import logger from "@/lib/logger";
import { createAppleWalletPass, getAppleWalletPassIdentifiers } from "@/lib/appleWalletPass";
import { authorizeWalletPassRequest } from "@/lib/appleWalletWebService";
import { getMemberPassProfileById } from "@/lib/memberPassProfile";
import {
  parseAssociatedStoreIdentifiers,
  shouldEnableAppleWalletAppLinks,
  shouldEnableAppleWalletUpdates,
} from "@/lib/appleWalletConfig";
import { absoluteUrl } from "@/lib/siteUrl";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  {
    params,
  }: {
    params: {
      passTypeIdentifier: string;
      serialNumber: string;
    };
  }
) {
  try {
    await connectDB();

    const authorization = await authorizeWalletPassRequest({
      authorizationHeader: req.headers.get("authorization"),
      passTypeIdentifier: params.passTypeIdentifier,
      serialNumber: params.serialNumber,
    });
    if (!authorization.ok) {
      return authorization.response;
    }

    const member = await getMemberPassProfileById(authorization.record.memberId);
    if (!member) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const { identifiers } = await getAppleWalletPassIdentifiers();
    const nfcEncryptionPublicKey = process.env.APPLE_WALLET_NFC_PUBLIC_KEY?.trim();
    const associatedStoreIdentifiers = parseAssociatedStoreIdentifiers();
    const updatesEnabled = shouldEnableAppleWalletUpdates(req.url);
    const appLinksEnabled = shouldEnableAppleWalletAppLinks();
    const pass = await createAppleWalletPass(member, {
      identifiers,
      serialNumber: authorization.record.serialNumber,
      authenticationToken: updatesEnabled
        ? authorization.record.authenticationToken
        : undefined,
      webServiceURL: updatesEnabled
        ? absoluteUrl("/api/wallet/apple-pass/v1")
        : undefined,
      nfcMessage: nfcEncryptionPublicKey ? authorization.record.nfcMessage : undefined,
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
    logger.error({ err }, "Failed to return updated Apple Wallet pass");
    return NextResponse.json(
      { error: err?.message || "Failed to return updated Apple Wallet pass" },
      { status: 500 }
    );
  }
}
