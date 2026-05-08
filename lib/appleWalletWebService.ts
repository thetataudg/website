import { NextResponse } from "next/server";
import logger from "@/lib/logger";
import { findWalletPassRecord } from "@/lib/walletPassStore";

export async function authorizeWalletPassRequest(input: {
  authorizationHeader: string | null;
  passTypeIdentifier: string;
  serialNumber: string;
}) {
  const record = await findWalletPassRecord({
    passTypeIdentifier: input.passTypeIdentifier,
    serialNumber: input.serialNumber,
  });

  if (!record) {
    return { ok: false as const, response: NextResponse.json({ error: "Pass not found" }, { status: 404 }) };
  }

  const expectedAuthorization = `ApplePass ${record.authenticationToken}`;
  if (input.authorizationHeader !== expectedAuthorization) {
    logger.warn(
      {
        passTypeIdentifier: input.passTypeIdentifier,
        serialNumber: input.serialNumber,
      },
      "Rejected Apple Wallet web-service request"
    );
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Request not authorized" }, { status: 401 }),
    };
  }

  return { ok: true as const, record };
}
