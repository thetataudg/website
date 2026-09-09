import PollRespondClient from "../../_polls/PollRespondClient";

export const dynamic = "force-dynamic";

export default function ChapterPollPage({
  params,
}: {
  params: { pollId: string };
}) {
  return (
    <PollRespondClient
      pollId={params.pollId}
      backHref="/member/committees"
      resultsHref={`/member/committees/polls/${params.pollId}/results`}
    />
  );
}
