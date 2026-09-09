import PollCreatePageClient from "./PollCreatePageClient";

export const dynamic = "force-dynamic";

/// Chapter-wide poll (no committee). The API still enforces admin / E-Council.
export default function NewChapterPollPage() {
  return <PollCreatePageClient />;
}
