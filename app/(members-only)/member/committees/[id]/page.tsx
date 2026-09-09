import CommitteeDashboardClient from "./CommitteeDashboardClient";

export const dynamic = "force-dynamic";

export default function CommitteeDashboardPage({
  params,
}: {
  params: { id: string };
}) {
  return <CommitteeDashboardClient committeeId={params.id} />;
}
