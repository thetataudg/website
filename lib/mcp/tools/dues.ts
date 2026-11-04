// lib/mcp/tools/dues.ts
// Dues, read-only. Anyone can read their own balance; reading anybody else's,
// or the chapter roster, is `canManageDues` (admins and E-Council), the same
// rule as `requireTreasury` on /api/dues.
//
// There is deliberately no write tool. Every ledger write on the site (raising
// a charge, recording a payment, approving a claim or plan, refunds, card
// payments) writes finance audit events, applies credit and notifies members,
// and the ones that touch Stripe move real money. None is a "simple, safe"
// operation to hand to an agent, so they stay on the website and the phone app.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import DuesCharge from "@/lib/models/DuesCharge";
import { canManageDues } from "@/lib/duesAuth";
import { loadDuesRoster, loadMemberLedger } from "@/lib/duesRead";
import { READ_ONLY, ToolError, defineTool, type McpContext } from "@/lib/mcp/tool";
import { fullName, requireMember } from "@/lib/mcp/resolve";

const dollars = (cents: number) => Math.round(Number(cents) || 0) / 100;

function ledger(summary: any) {
  return {
    currency: summary.currency,
    balanceDollars: dollars(summary.balanceCents),
    chargedDollars: dollars(summary.chargedCents),
    paidDollars: dollars(summary.paidCents),
    nextDueDate: summary.nextDueDate,
    hasOverdue: summary.hasOverdue,
    balanceCents: summary.balanceCents,
    charges: summary.charges.map((charge: any) => ({
      id: charge._id,
      term: charge.term,
      description: charge.description,
      category: charge.category,
      amountDollars: dollars(charge.amountCents),
      paidDollars: dollars(charge.paidCents),
      balanceDollars: dollars(charge.balanceCents),
      dueDate: charge.dueDate,
      status: charge.status,
      isOverdue: charge.isOverdue,
    })),
  };
}

function requireTreasurer(ctx: McpContext) {
  if (!canManageDues(ctx.member)) {
    throw new ToolError(
      "Not allowed: chapter dues can only be viewed by admins and E-Council. You can still use get_my_dues."
    );
  }
}

export function registerDuesTools(server: McpServer, ctx: McpContext) {
  defineTool(server, ctx, "get_my_dues", {
    title: "My dues",
    description: "Your own dues: balance, what is overdue and each charge. Read-only.",
    input: { term: z.string().optional().describe("Only this term, for example 'Fall 2026'.") },
    annotations: READ_ONLY,
    run: async ({ term }, c) => ledger(await loadMemberLedger(c.member._id, term ? { term } : {})),
  });

  defineTool(server, ctx, "get_member_dues", {
    title: "A member's dues",
    description:
      "Another member's dues ledger by id, roll number or full name. Admins and E-Council only. Read-only.",
    input: {
      member: z.string().describe("Member id, roll number or full name."),
      term: z.string().optional(),
    },
    annotations: READ_ONLY,
    run: async ({ member, term }, c) => {
      requireTreasurer(c);
      const target = await requireMember(member);
      return {
        member: fullName(target),
        rollNo: target.rollNo,
        ...ledger(await loadMemberLedger(target._id, term ? { term } : {})),
      };
    },
  });

  defineTool(server, ctx, "dues_summary", {
    title: "Chapter dues summary",
    description:
      "The treasurer's roster: chapter-wide totals (outstanding, collected, overdue, members owing, plans behind) and one row per member with their balance. By default only members who owe money, largest balance first. Admins and E-Council only. Read-only.",
    input: {
      term: z.string().optional(),
      includeSettled: z.boolean().optional().describe("Also list members who owe nothing."),
      limit: z.number().int().min(1).max(200).default(50),
    },
    annotations: READ_ONLY,
    run: async ({ term, includeSettled, limit }, c) => {
      requireTreasurer(c);
      const charges = await DuesCharge.find(term ? { term } : {}).sort({ createdAt: -1 }).lean();
      const roster = await loadDuesRoster(charges as any[]);
      const rows = roster.members.filter((row: any) => includeSettled || row.balanceCents > 0);
      return {
        totals: {
          ...roster.totals,
          outstandingDollars: dollars(roster.totals.outstandingCents),
          collectedDollars: dollars(roster.totals.collectedCents),
        },
        listed: Math.min(rows.length, limit ?? 50),
        matching: rows.length,
        members: rows.slice(0, limit ?? 50).map((row: any) => ({
          memberId: row.memberId,
          rollNo: row.rollNo,
          name: `${row.fName} ${row.lName}`.trim(),
          status: row.status,
          balanceDollars: dollars(row.balanceCents),
          paidDollars: dollars(row.paidCents),
          creditDollars: dollars(row.creditCents),
          nextDueDate: row.nextDueDate,
          isOverdue: row.isOverdue,
          awaitingReview: row.awaitingReview,
          plan: row.plan
            ? {
                amountDueNowDollars: dollars(row.plan.amountDueNowCents),
                dueNowDate: row.plan.dueNowDate,
                isBehind: row.plan.isBehind,
              }
            : null,
        })),
      };
    },
  });
}
