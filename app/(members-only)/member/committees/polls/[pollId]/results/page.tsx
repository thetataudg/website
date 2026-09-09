import PollResultsClient from "../../../_polls/PollResultsClient";

export const dynamic = "force-dynamic";

export default function ChapterPollResultsPage({
  params,
}: {
  params: { pollId: string };
}) {
  return (
    <PollResultsClient
      pollId={params.pollId}
      backHref={`/member/committees/polls/${params.pollId}`}
    />
  );
}
