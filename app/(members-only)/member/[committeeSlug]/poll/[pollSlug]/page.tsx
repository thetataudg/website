// Resolves a shared poll link — /member/<committee-slug>/poll/<poll-slug> — to
// the canonical id route and redirects. The pretty URL is what a head pastes
// into Discord; the id route is what the app actually renders.
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/db";
import AvailabilityPoll from "@/lib/models/AvailabilityPoll";
import Committee from "@/lib/models/Committee";
import { slugify } from "@/lib/availability/slug";

export const dynamic = "force-dynamic";

export default async function SharedPollPage({
  params,
}: {
  params: { committeeSlug: string; pollSlug: string };
}) {
  await connectDB();

  let committeeId: string | null = null;
  if (params.committeeSlug !== "chapter") {
    const committees = await Committee.find().select("_id name").lean<any[]>();
    const match = committees.find(
      (c) => slugify(c.name || "") === params.committeeSlug
    );
    if (!match) redirect("/member/committees");
    committeeId = String(match._id);
  }

  const poll = await AvailabilityPoll.findOne({
    slug: params.pollSlug,
    committeeId,
  })
    .select("_id committeeId")
    .lean<any>();

  if (!poll) redirect("/member/committees");

  redirect(
    poll.committeeId
      ? `/member/committees/${poll.committeeId}/polls/${poll._id}`
      : `/member/committees/polls/${poll._id}`
  );
}
