// POST /api/tasks/suggest { committeeId?, title, description }: tag and
// priority suggestions for the New task form while it is being written.
// Read only: suggested new tags are names, created only if someone picks one.
import { z } from "zod";

import { groqEnabled } from "@/lib/ai/groq";
import { HttpError } from "@/lib/httpError";
import { rateLimit } from "@/lib/rateLimit";
import { suggestSort } from "@/lib/tasks/autosort";
import { assertTrackerAccess } from "@/lib/tasks/permissions";
import { listTags, trackerCommittee } from "@/lib/tasks/service";
import { handle, jsonBody } from "@/lib/tasks/routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const body = z.object({
  committeeId: z.string().nullable().optional(),
  title: z.string().trim().max(200),
  description: z.string().max(4000).optional().default(""),
});

export async function POST(req: Request) {
  const input = await jsonBody(req);
  return handle(req, "Failed to suggest", async (member) => {
    const parsed = body.safeParse(input);
    if (!parsed.success) throw new HttpError(400, "Bad request");
    const { committeeId, title, description } = parsed.data;
    const committee = await trackerCommittee(committeeId);
    assertTrackerAccess(member, committee, "view");
    if (!groqEnabled() || title.length < 3) return { enabled: groqEnabled(), tagIds: [], newTag: null, priority: null };
    if (!rateLimit(`suggest:${String(member._id)}`, 40, 600).ok) return { enabled: true, tagIds: [], newTag: null, priority: null };

    const tags = await listTags(member, committeeId);
    const s = await suggestSort({ title, description }, tags.map((t) => t.name));
    if (!s || s.actionable === false) return { enabled: true, tagIds: [], newTag: null, priority: null };
    const byName = new Map(tags.map((t) => [t.name.toLowerCase(), t.id]));
    const tagIds = Array.from(new Set(s.tags.map((n) => byName.get(n.trim().toLowerCase())).filter(Boolean)));
    const newTag = s.newTag && !byName.has(s.newTag.trim().toLowerCase()) ? s.newTag.trim() : null;
    return { enabled: true, tagIds, newTag, priority: s.priority === "none" ? null : s.priority };
  });
}
