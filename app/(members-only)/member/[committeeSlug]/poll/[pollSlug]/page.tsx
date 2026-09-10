// Resolves a shared poll link — /member/<committee-slug>/poll/<poll-slug> — to
// the canonical id route and redirects. The pretty URL is what a head pastes
// into Discord; the id route is what the app actually renders.
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/db";
import { resolvePollSlug } from "@/lib/availability/slug";

export const dynamic = "force-dynamic";

export default async function SharedPollPage({
  params,
}: {
  params: { committeeSlug: string; pollSlug: string };
}) {
  await connectDB();

  const found = await resolvePollSlug(params.committeeSlug, params.pollSlug);
  if (!found) redirect("/member/committees");

  redirect(
    found.committeeId
      ? `/member/committees/${found.committeeId}/polls/${found.pollId}`
      : `/member/committees/polls/${found.pollId}`
  );
}
