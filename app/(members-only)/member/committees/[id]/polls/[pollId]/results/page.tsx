import PollResultsClient from "../../../../_polls/PollResultsClient";

export const dynamic = "force-dynamic";

export default function CommitteePollResultsPage({
  params,
}: {
  params: { id: string; pollId: string };
}) {
  return (
    <PollResultsClient
      pollId={params.pollId}
      backHref={`/member/committees/${params.id}/polls/${params.pollId}`}
    />
  );
}
