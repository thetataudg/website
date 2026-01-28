import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Committee from "@/lib/models/Committee";
import logger from "@/lib/logger";

const SECRET = process.env.COMMITTEES_BOT_SECRET;
const HEADER_NAME = (process.env.COMMITTEES_BOT_SECRET_HEADER || "x-api-secret").toLowerCase();

export async function GET(req: Request) {
  const provided = req.headers.get(HEADER_NAME);
  if (!provided || provided !== SECRET) {
    logger.warn({ provided, header: HEADER_NAME }, "Unauthorized committee bot request");
    return NextResponse.json(
      {
        error: "Unauthorized",
        header: HEADER_NAME,
        provided,
        expected: SECRET,
      },
      { status: 401 }
    );
  }

  try {
    await connectDB();
    const committees = await Committee.find().lean();
    return NextResponse.json(committees, { status: 200 });
  } catch (err: any) {
    logger.error({ err }, "Failed to fetch committees (bot)");
    return NextResponse.json({ error: err.message || "Failed to fetch committees" }, { status: 500 });
  }
}
