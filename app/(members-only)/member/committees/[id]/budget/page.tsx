import HeadBudgetClient from "./HeadBudgetClient";

export const dynamic = "force-dynamic";

export default function CommitteeBudgetPage({ params }: { params: { id: string } }) {
  return <HeadBudgetClient committeeId={params.id} />;
}
