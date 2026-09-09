"use client";

// Chapter-wide poll creation as a standalone page (there is no dashboard to
// host a modal). Committee polls open the modal on the dashboard instead.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PageContainer, PageHeader } from "../../../../components/shell/PageShell";
import PollCreateForm from "../../_polls/PollCreateForm";

export default function PollCreatePageClient() {
  const router = useRouter();
  return (
    <PageContainer className="max-w-2xl space-y-6">
      <PageHeader
        eyebrow={
          <Link
            href="/member/committees"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Back
          </Link>
        }
        title="New chapter-wide poll"
        description="Asks every active member."
      />
      <PollCreateForm
        committeeId={null}
        onCancel={() => router.push("/member/committees")}
        onDone={(poll) => router.push(`/member/committees/polls/${poll._id}`)}
      />
    </PageContainer>
  );
}
