// GET /api/test-db
// Test route to verify MongoDB connection is working

import { connectDB } from "@/lib/db";
import { NextResponse } from "next/server";
import logger from "@/lib/logger";

export async function GET() {
  try {
    await connectDB();
    logger.info("MongoDB connected successfully");

    return NextResponse.json(
      { result: "success" },
      { status: 200 }
    );
  } catch (error: any) {
    logger.error("MongoDB connection failed", error);

    return NextResponse.json(
      { result: "Failed to connect to MongoDB" },
      { status: 500 }
    );
  }
}
