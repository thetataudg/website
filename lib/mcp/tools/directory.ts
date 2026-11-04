// lib/mcp/tools/directory.ts
// Who is in the chapter: whoami, members and committees.
//
// Contact details (email, phone) and website roles are shown to admins and
// E-Council only. The public roster route sends them to anyone, which is a
// documented stopgap there; an agent acting for a member should not widen it.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import Committee from "@/lib/models/Committee";
import Member from "@/lib/models/Member";
import { canManageDues } from "@/lib/duesAuth";
import { isChapterToolSubmitter } from "@/lib/chapterTools";
import { listCommittees, loadCommittee } from "@/lib/committeeQueries";
import { isAdminActor, isOfficerActor } from "@/lib/events/permissions";
import { READ_ONLY, ToolError, defineTool, type McpContext } from "@/lib/mcp/tool";
import { fullName, isObjectId, requireCommittee } from "@/lib/mcp/resolve";

function person(member: any) {
  return member
    ? { id: String(member._id), name: fullName(member), rollNo: member.rollNo }
    : null;
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function memberCard(member: any, officer: boolean) {
  return {
    id: String(member._id),
    name: fullName(member),
    rollNo: member.rollNo,
    status: member.status,
    gradYear: member.gradYear ?? null,
    pledgeClass: member.pledgeClass || null,
    majors: member.majors?.length ? member.majors : undefined,
    ecouncilPosition: member.isECouncil ? member.ecouncilPosition || "E-Council" : null,
    committees: member.committees?.length ? member.committees : undefined,
    ...(officer
      ? {
          email: member.email ?? null,
          phone: member.phone ?? null,
          role: member.role,
          hasAccount: !!member.clerkId,
        }
      : {}),
  };
}

export function registerDirectoryTools(server: McpServer, ctx: McpContext) {
  defineTool(server, ctx, "whoami", {
    title: "Who am I",
    description:
      "The chapter member you are acting as: name, role, E-Council seat, the committees you head or belong to, and what that lets you do through these tools.",
    input: {},
    annotations: READ_ONLY,
    run: async (_args, c) => {
      const me = c.member;
      const [headed, belongs] = await Promise.all([
        Committee.find({ committeeHeadId: me._id }).select("name").lean<any[]>(),
        Committee.find({ committeeMembers: me._id }).select("name").lean<any[]>(),
      ]);
      return {
        id: String(me._id),
        name: fullName(me),
        rollNo: me.rollNo,
        status: me.status,
        role: me.role,
        isECouncil: !!me.isECouncil,
        ecouncilPosition: me.ecouncilPosition || null,
        committeesHeaded: headed.map((row) => ({ id: String(row._id), name: row.name })),
        committeesMemberOf: belongs.map((row) => ({ id: String(row._id), name: row.name })),
        can: {
          manageAnyEvent: isOfficerActor(me),
          manageOwnCommitteeEvents: headed.length > 0,
          runLifecycleSweep: isAdminActor(me),
          viewChapterDues: canManageDues(me),
          sendAnnouncements: isChapterToolSubmitter(me),
          seeMemberContactDetails: isOfficerActor(me),
        },
      };
    },
  });

  defineTool(server, ctx, "search_members", {
    title: "Search members",
    description:
      "Find chapter members by name or roll number. Returns name, roll number, status, graduation year and E-Council seat. Admins and E-Council also see email, phone and role. Hidden profiles appear only to them.",
    input: {
      query: z.string().optional().describe("Part of a first name, last name, full name or roll number."),
      status: z.enum(["Active", "Alumni", "Removed", "Deceased"]).optional(),
      committee: z.string().optional().describe("Only members of this committee (name or id)."),
      eCouncilOnly: z.boolean().optional(),
      limit: z.number().int().min(1).max(50).default(20),
    },
    annotations: READ_ONLY,
    run: async (args, c) => {
      const officer = isOfficerActor(c.member);
      const filter: any = {};
      if (!officer) filter.isHidden = { $ne: true };
      if (args.status) filter.status = args.status;
      if (args.eCouncilOnly) filter.isECouncil = true;

      const query = args.query?.trim();
      if (query) {
        const parts = query.split(/\s+/).map((part: string) => new RegExp(escapeRegExp(part), "i"));
        // Every word has to appear in the first name, last name or roll number,
        // so "jane doe" finds Jane Doe and "doe 12" narrows further.
        filter.$and = parts.map((pattern: RegExp) => ({
          $or: [{ fName: pattern }, { lName: pattern }, { rollNo: pattern }],
        }));
      }
      if (args.committee) {
        const committee = await requireCommittee(args.committee);
        const ids = [committee.committeeHeadId, ...(committee.committeeMembers || [])].filter(Boolean);
        filter._id = { $in: ids };
      }

      const rows = await Member.find(filter)
        .select(
          "_id rollNo fName lName status gradYear pledgeClass majors isECouncil ecouncilPosition committees role email phone clerkId"
        )
        .sort({ lName: 1, fName: 1 })
        .limit(args.limit ?? 20)
        .lean<any[]>();
      return { count: rows.length, members: rows.map((row) => memberCard(row, officer)) };
    },
  });

  defineTool(server, ctx, "get_member", {
    title: "Get a member",
    description:
      "One member's profile by id, roll number or full name: status, class, majors, bio, skills, bigs and littles, committees. Admins and E-Council also see email, phone and website role.",
    input: { member: z.string().describe("Member id, roll number or full name.") },
    annotations: READ_ONLY,
    run: async ({ member: ref }, c) => {
      const officer = isOfficerActor(c.member);
      const text = String(ref).trim();
      let found: any = null;
      if (isObjectId(text)) found = await Member.findById(text).lean<any>();
      if (!found) found = await Member.findOne({ rollNo: text }).lean<any>();
      if (!found) {
        const parts = text.split(/\s+/);
        if (parts.length >= 2) {
          const rows = await Member.find({
            fName: new RegExp(`^${escapeRegExp(parts[0])}$`, "i"),
            lName: new RegExp(`^${escapeRegExp(parts.slice(1).join(" "))}$`, "i"),
          })
            .limit(2)
            .lean<any[]>();
          if (rows.length > 1) {
            throw new ToolError(`More than one member is named "${text}". Use a roll number or search_members.`);
          }
          found = rows[0] ?? null;
        }
      }
      if (!found || (found.isHidden && !officer && String(found._id) !== String(c.member._id))) {
        throw new ToolError(`No member found for "${text}".`);
      }
      const [bigs, littles, heads, belongs] = await Promise.all([
        Member.find({ _id: { $in: found.bigs || [] } }).select("fName lName rollNo").lean<any[]>(),
        Member.find({ _id: { $in: found.littles || [] } }).select("fName lName rollNo").lean<any[]>(),
        Committee.find({ committeeHeadId: found._id }).select("name").lean<any[]>(),
        Committee.find({ committeeMembers: found._id }).select("name").lean<any[]>(),
      ]);
      return {
        ...memberCard(found, officer),
        headline: found.headline || undefined,
        bio: found.bio || undefined,
        pronouns: found.pronouns || undefined,
        skills: found.skills?.length ? found.skills : undefined,
        hometown: found.hometown || undefined,
        familyLine: found.familyLine || undefined,
        bigs: bigs.map(person),
        littles: littles.map(person),
        headOf: heads.map((row) => row.name),
        memberOf: belongs.map((row) => row.name),
      };
    },
  });

  defineTool(server, ctx, "list_committees", {
    title: "List committees",
    description: "Every committee with its head and size. Use get_committee for the roster.",
    input: {},
    annotations: READ_ONLY,
    run: async () => {
      const rows: any[] = await listCommittees({});
      return {
        count: rows.length,
        committees: rows.map((row) => ({
          id: String(row._id),
          name: row.name,
          description: row.description || undefined,
          head: person(row.committeeHeadId),
          memberCount: (row.committeeMembers || []).length,
          color: row.color ?? null,
        })),
      };
    },
  });

  defineTool(server, ctx, "get_committee", {
    title: "Get a committee",
    description: "One committee by name or id: description, head, full roster and its events.",
    input: { committee: z.string().describe("Committee name or id.") },
    annotations: READ_ONLY,
    run: async ({ committee: ref }) => {
      const found = await requireCommittee(ref);
      const full: any = await loadCommittee(String(found._id));
      if (!full) throw new ToolError("Committee not found.");
      return {
        id: String(full._id),
        name: full.name,
        description: full.description || undefined,
        head: person(full.committeeHeadId),
        members: (full.committeeMembers || []).map(person),
        eventCount: (full.events || []).length,
        // Newest 30: a long-lived committee has hundreds, and list_events
        // (with its committee filter) is the way to page through them.
        recentEvents: [...(full.events || [])]
          .sort(
            (a: any, b: any) =>
              new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
          )
          .slice(0, 30)
          .map((event: any) => ({
            id: String(event._id),
            name: event.name,
            startTime: event.startTime ? new Date(event.startTime).toISOString() : null,
            status: event.status,
          })),
      };
    },
  });
}
