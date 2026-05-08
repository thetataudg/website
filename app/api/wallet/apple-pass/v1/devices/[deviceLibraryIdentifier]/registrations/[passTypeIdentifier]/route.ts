import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { listUpdatedWalletPassSerialNumbers } from "@/lib/walletPassStore";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  {
    params,
  }: {
    params: {
      deviceLibraryIdentifier: string;
      passTypeIdentifier: string;
    };
  }
) {
  await connectDB();

  const url = new URL(req.url);
  const result = await listUpdatedWalletPassSerialNumbers({
    deviceLibraryIdentifier: params.deviceLibraryIdentifier,
    passTypeIdentifier: params.passTypeIdentifier,
    passesUpdatedSince: url.searchParams.get("passesUpdatedSince"),
  });

  if (!result.serialNumbers.length) {
    return new NextResponse(null, { status: 204 });
  }

  return NextResponse.json(result, { status: 200 });
}
