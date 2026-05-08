import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import {
  registerWalletPassDevice,
  unregisterWalletPassDevice,
} from "@/lib/walletPassStore";
import { authorizeWalletPassRequest } from "@/lib/appleWalletWebService";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  {
    params,
  }: {
    params: {
      deviceLibraryIdentifier: string;
      passTypeIdentifier: string;
      serialNumber: string;
    };
  }
) {
  await connectDB();

  const authorization = await authorizeWalletPassRequest({
    authorizationHeader: req.headers.get("authorization"),
    passTypeIdentifier: params.passTypeIdentifier,
    serialNumber: params.serialNumber,
  });
  if (!authorization.ok) {
    return authorization.response;
  }

  const body = await req.json().catch(() => null);
  const pushToken = String(body?.pushToken || "").trim();
  if (!pushToken) {
    return NextResponse.json({ error: "pushToken is required" }, { status: 400 });
  }

  const result = await registerWalletPassDevice({
    deviceLibraryIdentifier: params.deviceLibraryIdentifier,
    passTypeIdentifier: params.passTypeIdentifier,
    serialNumber: params.serialNumber,
    pushToken,
  });

  return new NextResponse(null, { status: result.alreadyRegistered ? 200 : 201 });
}

export async function DELETE(
  req: Request,
  {
    params,
  }: {
    params: {
      deviceLibraryIdentifier: string;
      passTypeIdentifier: string;
      serialNumber: string;
    };
  }
) {
  await connectDB();

  const authorization = await authorizeWalletPassRequest({
    authorizationHeader: req.headers.get("authorization"),
    passTypeIdentifier: params.passTypeIdentifier,
    serialNumber: params.serialNumber,
  });
  if (!authorization.ok) {
    return authorization.response;
  }

  await unregisterWalletPassDevice({
    deviceLibraryIdentifier: params.deviceLibraryIdentifier,
    passTypeIdentifier: params.passTypeIdentifier,
    serialNumber: params.serialNumber,
  });

  return new NextResponse(null, { status: 200 });
}
