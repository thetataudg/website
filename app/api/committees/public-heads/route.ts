import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Committee from "@/lib/models/Committee";
import Member from "@/lib/models/Member";
import logger from "@/lib/logger";
import { Types } from "mongoose";

export async function GET() {
  try {
    await connectDB();

    const committees = await Committee.find({}, { name: 1, committeeHeadId: 1 })
      .populate("committeeHeadId", "rollNo fName lName")
      .lean();

    const headIdSet = new Set<string>();
    const headRollNos = new Set<string>();

    committees.forEach((committee: any) => {
      const headValue = committee.committeeHeadId;
      if (!headValue) return;
      if (typeof headValue === "object" && headValue.rollNo) return;
      const raw = typeof headValue === "string" ? headValue : headValue?.toString?.();
      if (!raw) return;
      if (Types.ObjectId.isValid(raw)) {
        headIdSet.add(raw);
      } else {
        headRollNos.add(raw);
      }
    });

    const [headById, headByRollNo] = await Promise.all([
      headIdSet.size
        ? Member.find(
            { _id: { $in: Array.from(headIdSet) } },
            { rollNo: 1, fName: 1, lName: 1 }
          ).lean()
        : Promise.resolve([]),
      headRollNos.size
        ? Member.find(
            { rollNo: { $in: Array.from(headRollNos) } },
            { rollNo: 1, fName: 1, lName: 1 }
          ).lean()
        : Promise.resolve([]),
    ]);

    const headByIdMap = new Map(
      headById.map((member: any) => [member._id.toString(), member])
    );
    const headByRollNoMap = new Map(
      headByRollNo.map((member: any) => [member.rollNo, member])
    );

    const heads = committees
      .map((committee: any) => {
        const headValue = committee.committeeHeadId;
        let head = null;

        if (headValue && typeof headValue === "object" && headValue.rollNo) {
          head = {
            rollNo: headValue.rollNo,
            fName: headValue.fName,
            lName: headValue.lName,
          };
        } else if (headValue) {
          const raw =
            typeof headValue === "string" ? headValue : headValue?.toString?.();
          if (raw) {
            const fromId = headByIdMap.get(raw);
            const fromRollNo = headByRollNoMap.get(raw);
            const member = fromId || fromRollNo;
            if (member) {
              head = {
                rollNo: member.rollNo,
                fName: member.fName,
                lName: member.lName,
              };
            }
          }
        }

        if (!head?.rollNo) return null;
        return { committeeName: committee.name, head };
      })
      .filter(Boolean);

    return NextResponse.json(heads, { status: 200 });
  } catch (err: any) {
    logger.error({ err }, "Failed to fetch public committee heads");
    return NextResponse.json({ error: "Failed to fetch committee heads" }, { status: 500 });
  }
}
