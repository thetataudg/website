#!/usr/bin/env ts-node
import "dotenv/config";
import { connectDB } from "../lib/db";
import Member from "../lib/models/Member";
import logger from "../lib/logger";

async function main(clerkId: string) {
  try {
    await connectDB();

    const exists = await Member.exists({ role: "superadmin" });
    if (exists) {
      logger.warn("Superadmin already exists.");
      process.exit(0);
    }

    const member = await Member.create({
      clerkId,
      rollNo: "000-ADMIN",
      fName: "Super",
      lName: "Admin",
      gradYear: 0,
      isECouncil: false,
      needsProfileReview: false,
      needsPermissionReview: false,
      role: "superadmin",
    });

    logger.info(`Superadmin created with id=${member._id}`);
    process.exit(0);
  } catch (err: any) {
    logger.error({ err }, "Seed script failed");
    process.exit(1);
  }
}

const clerkId = process.argv[2];
if (!clerkId) {
  logger.error("Usage: npx ts-node scripts/seedAdmin.ts <CLERK_ID>");
  process.exit(1);
}

main(clerkId);
