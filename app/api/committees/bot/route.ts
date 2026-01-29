import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Committee from "@/lib/models/Committee";
import logger from "@/lib/logger";

export async function GET() {
  try {
    await connectDB();
    const committees = await Committee.find().lean();
    return NextResponse.json(committees, { status: 200 });
  } catch (err: any) {
    logger.error({ err }, "Failed to fetch committees (bot)");
    return NextResponse.json({ error: err.message || "Failed to fetch committees" }, { status: 500 });
  }
}
