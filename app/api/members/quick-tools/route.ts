import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import logger from "@/lib/logger";
import Committee from "@/lib/models/Committee";
import Member from "@/lib/models/Member";

export const runtime = "nodejs";

const ELECTION_POSITIONS = [
  "Regent",
  "Vice Regent",
  "Marshal",
  "Treasurer",
  "Scribe",
  "Corresponding Secretary",
  "Regent Emeritus",
] as const;

type ElectionPosition = (typeof ELECTION_POSITIONS)[number];

type QuickToolsAction = "election" | "graduations";
type PurgeCommitteesAction = "purgeCommittees";
type QuickToolsActionWithPurge = QuickToolsAction | PurgeCommitteesAction;

type QuickToolsRequestBody = {
  action?: QuickToolsActionWithPurge;
  assignments?: Partial<Record<ElectionPosition, string>>;
  rollNos?: string[];
};

const ADMIN_POSITIONS = new Set<ElectionPosition>([
  "Regent",
  "Vice Regent",
  "Treasurer",
  "Scribe",
]);

const normalizeRollNo = (value: unknown) => String(value || "").trim();

async function requireQuickToolSubmitter(req: Request) {
  const clerkId = await requireAuth(req as any);
  await connectDB();

  // Admins as well as the two seats.
  //
  // This used to be superadmin *or* a sitting Regent/Vice Regent, which locked
  // out every other admin — including the Treasurer and Scribe, who the officer
  // election itself promotes to `role: "admin"`. An admin already has the run
  // of the roster through `/api/members/{rollNo}` and could do all three of
  // these by hand, one member at a time; refusing them the tool that does it in
  // one pass protected nothing and just made the job longer.
  const submitter = await Member.findOne({
    clerkId,
    $or: [
      { role: { $in: ["superadmin", "admin"] } },
      { isECouncil: true, ecouncilPosition: { $in: ["Regent", "Vice Regent"] } },
    ],
  }).lean<{ rollNo?: string; fName?: string; lName?: string; ecouncilPosition?: string; role?: string }>();

  if (!submitter) {
    const error = new Error(
      "You don't have access to submit this quick tool. It must be done by an admin, the Regent, or the Vice Regent."
    ) as Error & { statusCode?: number };
    error.statusCode = 403;
    throw error;
  }

  return { clerkId, submitter };
}

function buildElectionAssignments(assignments: Partial<Record<ElectionPosition, string>>) {
  const normalized: Partial<Record<ElectionPosition, string>> = {};
  for (const position of ELECTION_POSITIONS) {
    const rollNo = normalizeRollNo(assignments[position]);
    if (rollNo) {
      normalized[position] = rollNo;
    }
  }
  return normalized;
}

export async function POST(req: Request) {
  let body: QuickToolsRequestBody;
  try {
    body = (await req.json()) as QuickToolsRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (body.action === "purgeCommittees") {
    try {
      const { clerkId, submitter } = await requireQuickToolSubmitter(req);
      const regentOrViceRegent = submitter.ecouncilPosition || "";
      await connectDB();

      const committees = await Committee.find({})
        .select("name committeeHeadId committeeMembers")
        .lean<
          {
            name: string;
            committeeHeadId?: { toString: () => string } | string | null;
            committeeMembers?: Array<{ toString: () => string } | string>;
          }[]
        >();

      const historyUpdates = new Map<
        string,
        {
          previousCommitteesChaired: Set<string>;
          previousCommitteesMemberOf: Set<string>;
        }
      >();

      const addHistory = (
        memberId: string,
        field: "previousCommitteesChaired" | "previousCommitteesMemberOf",
        committeeName: string
      ) => {
        const existing = historyUpdates.get(memberId) || {
          previousCommitteesChaired: new Set<string>(),
          previousCommitteesMemberOf: new Set<string>(),
        };
        existing[field].add(committeeName);
        historyUpdates.set(memberId, existing);
      };

      for (const committee of committees) {
        const committeeName = String(committee.name || "").trim();
        if (!committeeName) continue;

        const headId =
          typeof committee.committeeHeadId === "string"
            ? committee.committeeHeadId
            : committee.committeeHeadId?.toString();
        if (headId) {
          addHistory(headId, "previousCommitteesChaired", committeeName);
        }

        for (const memberId of committee.committeeMembers || []) {
          const memberIdValue =
            typeof memberId === "string" ? memberId : memberId?.toString();
          if (memberIdValue) {
            addHistory(memberIdValue, "previousCommitteesMemberOf", committeeName);
          }
        }
      }

      if (historyUpdates.size) {
        await Promise.all(
          Array.from(historyUpdates.entries()).map(([memberId, patch]) =>
            Member.updateOne(
              { _id: memberId },
              {
                $addToSet: {
                  previousCommitteesChaired: {
                    $each: Array.from(patch.previousCommitteesChaired),
                  },
                  previousCommitteesMemberOf: {
                    $each: Array.from(patch.previousCommitteesMemberOf),
                  },
                },
              }
            )
          )
        );
      }

      const committeesResult = await Committee.updateMany(
        {},
        { $set: { committeeHeadId: null, committeeMembers: [] } }
      );
      await Member.updateMany({ isCommitteeHead: true }, { $set: { isCommitteeHead: false } });

      logger.info(
        { clerkId, rollNo: submitter.rollNo, position: regentOrViceRegent },
        "Committee purge completed"
      );

      return NextResponse.json({
        status: "ok",
        action: "purgeCommittees",
        updatedCount: committeesResult.modifiedCount ?? committeesResult.matchedCount ?? 0,
      });
    } catch (err: any) {
      logger.warn({ err }, "Unauthorized purge committees request");
      return NextResponse.json(
        { error: err.message },
        { status: err.statusCode || 401 }
      );
    }
  }

  let actor;
  try {
    actor = await requireQuickToolSubmitter(req);
  } catch (err: any) {
    logger.warn({ err }, "Unauthorized quick tools request");
    return NextResponse.json(
      { error: err.message },
      { status: err.statusCode || 401 }
    );
  }

  if (body.action === "election") {
    const assignments = buildElectionAssignments(body.assignments || {});
    const assignedRollNos = Object.values(assignments);
    if (!assignments["Regent"]) {
      return NextResponse.json(
        { error: "Regent must be assigned" },
        { status: 400 }
      );
    }
    if (!assignments["Regent Emeritus"]) {
      return NextResponse.json(
        { error: "Regent Emeritus must be assigned" },
        { status: 400 }
      );
    }
    if (assignedRollNos.length !== new Set(assignedRollNos).size) {
      return NextResponse.json(
        { error: "Each position must be assigned to a unique member" },
        { status: 400 }
      );
    }

    await connectDB();

    const selectedMembers = await Member.find({
      rollNo: { $in: assignedRollNos },
      role: { $ne: "superadmin" },
      isHidden: { $ne: true },
    }).lean<{ rollNo: string; role?: string; isECouncil?: boolean; ecouncilPosition?: string }[]>();

    if (selectedMembers.length !== assignedRollNos.length) {
      return NextResponse.json(
        { error: "One or more selected members could not be found" },
        { status: 404 }
      );
    }

    const selectedByRollNo = new Map(
      selectedMembers.map((member) => [member.rollNo, member])
    );
    const currentBoardMembers = await Member.find({
      role: { $ne: "superadmin" },
      isHidden: { $ne: true },
      isECouncil: true,
      ecouncilPosition: { $in: ELECTION_POSITIONS },
    }).lean<{ rollNo: string; role?: string; ecouncilPosition?: string }[]>();

    const eCouncilHistoryUpdates = new Map<string, Set<string>>();
    for (const member of currentBoardMembers) {
      const previousRole = String(member.ecouncilPosition || "").trim();
      if (!previousRole || previousRole === "Regent Emeritus") continue;
      const existing = eCouncilHistoryUpdates.get(member.rollNo) || new Set<string>();
      existing.add(previousRole);
      eCouncilHistoryUpdates.set(member.rollNo, existing);
    }

    if (eCouncilHistoryUpdates.size) {
      await Promise.all(
        Array.from(eCouncilHistoryUpdates.entries()).map(
          ([rollNo, previousECouncilRoles]) =>
            Member.updateOne(
              { rollNo },
              {
                $addToSet: {
                  previousECouncilRoles: {
                    $each: Array.from(previousECouncilRoles),
                  },
                },
              }
            )
        )
      );
    }

    const updates = new Map<string, Record<string, unknown>>();
    const addUpdate = (rollNo: string, patch: Record<string, unknown>) => {
      const existing = updates.get(rollNo) || {};
      updates.set(rollNo, { ...existing, ...patch });
    };

    for (const [position, rollNo] of Object.entries(assignments) as [
      ElectionPosition,
      string
    ][]) {
      const member = selectedByRollNo.get(rollNo);
      if (!member) continue;

      const patch: Record<string, unknown> = {
        isECouncil: true,
        ecouncilPosition: position,
      };

      if (ADMIN_POSITIONS.has(position)) {
        patch.role = "admin";
      } else if (member.role === "admin") {
        patch.role = "member";
      }

      addUpdate(rollNo, patch);
    }

    for (const member of currentBoardMembers) {
      const selectedPosition = Object.entries(assignments).find(
        ([, rollNo]) => rollNo === member.rollNo
      )?.[0] as ElectionPosition | undefined;

      if (!selectedPosition) {
        const patch: Record<string, unknown> = {
          isECouncil: false,
          ecouncilPosition: "",
        };
        if (member.role === "admin") {
          patch.role = "member";
        }
        addUpdate(member.rollNo, patch);
        continue;
      }

      const patch: Record<string, unknown> = {
        isECouncil: true,
        ecouncilPosition: selectedPosition,
      };
      if (ADMIN_POSITIONS.has(selectedPosition)) {
        patch.role = "admin";
      } else if (member.role === "admin") {
        patch.role = "member";
      }
      addUpdate(member.rollNo, patch);
    }

    await Promise.all(
      Array.from(updates.entries()).map(([rollNo, patch]) =>
        Member.updateOne({ rollNo }, { $set: patch })
      )
    );

    logger.info(
      {
        adminId: actor.clerkId,
        assignments,
      },
      "Quick tools election completed"
    );

    return NextResponse.json({
      status: "ok",
      action: "election",
      updatedCount: updates.size,
    });
  }

  if (body.action === "graduations") {
    const rollNos = Array.from(
      new Set((body.rollNos || []).map((rollNo) => normalizeRollNo(rollNo)).filter(Boolean))
    );

    if (!rollNos.length) {
      return NextResponse.json(
        { error: "Select at least one active member to graduate" },
        { status: 400 }
      );
    }

    await connectDB();

    const activeMembers = await Member.find({
      rollNo: { $in: rollNos },
      status: "Active",
      role: { $ne: "superadmin" },
      isHidden: { $ne: true },
    }).lean<{ rollNo: string }[]>();

    const validRollNos = activeMembers.map((member) => member.rollNo);
    if (!validRollNos.length) {
      return NextResponse.json(
        { error: "No active members matched the selected roll numbers" },
        { status: 404 }
      );
    }

    await Member.updateMany(
      { rollNo: { $in: validRollNos } },
      { $set: { status: "Alumni" } }
    );

    logger.info(
      {
        adminId: actor.clerkId,
        rollNos: validRollNos,
      },
      "Quick tools graduations completed"
    );

    return NextResponse.json({
      status: "ok",
      action: "graduations",
      updatedCount: validRollNos.length,
    });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
