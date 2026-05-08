import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import { NextRequest, NextResponse } from "next/server";
import logger from "@/lib/logger";
import { requireRole } from "@/lib/clerk";
import { FamilyTreeImportInput, validateFamilyTreeImport } from "@/lib/family-tree-utils";

export const dynamic = "force-dynamic";

interface CommitResult {
  created: number;
  updated: number;
  errors: Array<{ rollNo: string; error: string }>;
  summary: string;
}

export async function POST(req: NextRequest) {
  await connectDB();

  let admin;
  try {
    admin = await requireRole(req, ["superadmin", "admin"]);
  } catch (err: any) {
    logger.warn({ err }, "Unauthorized family tree import attempt");
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 500 });
  }

  const body = await req.json();
  const action = body?.action;
  const jsonData = body?.jsonData;

  if (!Array.isArray(jsonData)) {
    return NextResponse.json({ error: "jsonData must be an array" }, { status: 400 });
  }

  for (const record of jsonData as FamilyTreeImportInput[]) {
    if (record == null) {
      return NextResponse.json({ error: "Invalid import record" }, { status: 400 });
    }

    if (
      record.rollNo === undefined ||
      record.rollNo === null ||
      record.fName === undefined ||
      record.lName === undefined
    ) {
      return NextResponse.json(
        { error: "Each record must include rollNo, fName, and lName" },
        { status: 400 }
      );
    }

    if (!Array.isArray(record.littles)) {
      return NextResponse.json({ error: "littles must be an array" }, { status: 400 });
    }
  }

  if (action === "validate") {
    const validation = await validateFamilyTreeImport(jsonData as FamilyTreeImportInput[]);
    logger.info(
      {
        adminId: admin.clerkId,
        creates: validation.creates.length,
        updates: validation.updates.length,
        warnings: validation.warnings.length,
      },
      "Family tree import validated"
    );
    return NextResponse.json(validation);
  }

  if (action !== "commit") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const validation = await validateFamilyTreeImport(jsonData as FamilyTreeImportInput[]);
  if (validation.errors.length > 0) {
    return NextResponse.json(
      { error: "Validation failed", details: validation.errors },
      { status: 400 }
    );
  }

  const rollNoToId = new Map<string, string>();
  const result: CommitResult = {
    created: 0,
    updated: 0,
    errors: [],
    summary: "",
  };

  for (const record of jsonData as FamilyTreeImportInput[]) {
    const rollNo = String(record.rollNo).trim();

    try {
      const existing = await Member.findOne({ rollNo }).select("_id");

      if (existing) {
        rollNoToId.set(rollNo, String(existing._id));
      } else {
        const created = await Member.create({
          rollNo,
          fName: String(record.fName).trim(),
          lName: String(record.lName).trim(),
          status: "Alumni",
          bigs: [],
          littles: [],
        });
        rollNoToId.set(rollNo, String(created._id));
        result.created += 1;
      }
    } catch (error: any) {
      result.errors.push({ rollNo, error: error.message || "Failed to create or load member" });
    }
  }

  for (const record of jsonData as FamilyTreeImportInput[]) {
    const rollNo = String(record.rollNo).trim();
    const memberId = rollNoToId.get(rollNo);

    if (!memberId) {
      continue;
    }

    try {
      const bigIds: string[] = [];
      if (record.big !== null && record.big !== undefined) {
        const bigId = rollNoToId.get(String(record.big).trim());
        if (bigId) {
          bigIds.push(bigId);
        }
      }

      const littleIds: string[] = [];
      for (const littleRollNo of record.littles) {
        const littleId = rollNoToId.get(String(littleRollNo).trim());
        if (littleId) {
          littleIds.push(littleId);
        }
      }

      await Member.updateOne(
        { _id: memberId },
        {
          $set: {
            bigs: bigIds,
            littles: littleIds,
          },
        }
      );

      result.updated += 1;
    } catch (error: any) {
      result.errors.push({ rollNo, error: error.message || "Failed to update relationships" });
    }
  }

  result.summary = `Created ${result.created} new members, updated relationships for ${result.updated} members.`;

  logger.info(
    {
      adminId: admin.clerkId,
      created: result.created,
      updated: result.updated,
      errors: result.errors.length,
    },
    "Family tree import committed"
  );

  return NextResponse.json(result);
}