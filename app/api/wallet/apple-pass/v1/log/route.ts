import { NextResponse } from "next/server";
import logger from "@/lib/logger";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const logs = Array.isArray(body?.logs) ? body.logs : [];
  for (const entry of logs) {
    logger.info({ walletLog: entry }, "Apple Wallet client log");
  }
  return new NextResponse(null, { status: 200 });
}
