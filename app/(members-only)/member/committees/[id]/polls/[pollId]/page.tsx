import PollRespondClient from "../../../_polls/PollRespondClient";

export const dynamic = "force-dynamic";

export default function CommitteePollPage({
  params,
}: {
  params: { id: string; pollId: string };
}) {
  const base = `/member/committees/${params.id}`;
  return (
    <PollRespondClient
      pollId={params.pollId}
      backHref={base}
      resultsHref={`${base}/polls/${params.pollId}/results`}
    />
  );
}
