"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleCheck, Inbox, TriangleAlert } from "lucide-react";

import LoadingState from "../../../../components/LoadingState";
import { PageContainer, PageHeader } from "../../../../components/shell/PageShell";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** Waiting-time badge: red past a week, amber past three days. */
function AgeBadge({ days }: { days: number }) {
  return (
    <Badge
      variant={days >= 7 ? "destructive" : days >= 3 ? "warning" : "muted"}
    >
      {days}d
    </Badge>
  );
}

/** Shared zero-state for all three queues. */
function QueueEmpty({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <div className="rounded-full bg-muted p-3">
        <Inbox className="size-5 text-muted-foreground" aria-hidden="true" />
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

/** One count in a queue summary. Renders <dt>/<dd> — wrap in a <dl>. */
function QueueTile({
  label,
  value,
  danger,
}: {
  label: string;
  value: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1 text-xl font-semibold tabular-nums",
          danger ? "text-destructive" : "text-foreground"
        )}
      >
        {value}
      </dd>
    </div>
  );
}
import VerifyPaymentModal, { QueuedSubmission } from "./VerifyPaymentModal";
import ReviewReimbursementModal, {
  QueuedReimbursement,
} from "./ReviewReimbursementModal";
import ReviewPlanModal, { QueuedPlan } from "./ReviewPlanModal";

type Tab = "payments" | "reimbursements" | "plans";

type PlanQueue = {
  plans: QueuedPlan[];
  totals: {
    pendingCount: number;
    pendingCents: number;
    activeCount: number;
    defaultedCount: number;
    oldestPendingDays: number;
  };
};

type ReimbursementQueue = {
  reimbursements: QueuedReimbursement[];
  totals: { pendingCount: number; pendingCents: number; oldestPendingDays: number };
};

type QueueResponse = {
  submissions: QueuedSubmission[];
  totals: {
    pendingCount: number;
    pendingCents: number;
    oldestPendingDays: number;
  };
};

function money(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });
}

function dayLabel(iso: string | null) {
  if (!iso) return "Not set";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/Phoenix",
  });
}

export default function DuesRequestsPage() {
  const [data, setData] = useState<QueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<QueuedSubmission | null>(null);
  const [claims, setClaims] = useState<ReimbursementQueue | null>(null);
  const [reviewingClaim, setReviewingClaim] = useState<QueuedReimbursement | null>(null);
  const [plans, setPlans] = useState<PlanQueue | null>(null);
  const [reviewingPlan, setReviewingPlan] = useState<QueuedPlan | null>(null);
  const [tab, setTab] = useState<Tab>("payments");
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dues/submissions?status=pending");
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || "Couldn't load the queue");
      }
      setData(await res.json());
      setError(null);

      const claimRes = await fetch("/api/reimbursements?status=pending");
      if (claimRes.ok) setClaims(await claimRes.json());

      const planRes = await fetch("/api/dues/plans?status=pending");
      if (planRes.ok) setPlans(await planRes.json());
    } catch (err: any) {
      setError(err.message || "Couldn't load the queue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingState message="Loading requests..." />;

  if (error || !data) {
    return (
      <PageContainer className="max-w-7xl space-y-4">
        <Alert variant="destructive" role="alert">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>
            {error || "Couldn't load the queue"}
          </AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => load()}>
          Try again
        </Button>
      </PageContainer>
    );
  }

  const { submissions, totals } = data;
  const claimTotals = claims?.totals ?? {
    pendingCount: 0,
    pendingCents: 0,
    oldestPendingDays: 0,
  };
  const planTotals = plans?.totals ?? {
    pendingCount: 0,
    pendingCents: 0,
    activeCount: 0,
    defaultedCount: 0,
    oldestPendingDays: 0,
  };

  return (
    <PageContainer className="max-w-7xl space-y-6">
      <PageHeader
        title="Requests"
        description="Payments members have reported, waiting on you."
      />

      <div aria-live="polite" className="empty:hidden">
        {flash && (
          <Alert variant="success">
            <CircleCheck aria-hidden="true" />
            <AlertDescription>{flash}</AlertDescription>
          </Alert>
        )}
      </div>

      {/* Was a Bootstrap nav-tabs list of buttons with no tab semantics. */}
      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="payments" className="gap-2">
            Payments
            {totals.pendingCount > 0 && (
              <Badge variant="secondary">{totals.pendingCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="reimbursements" className="gap-2">
            Reimbursements
            {claimTotals.pendingCount > 0 && (
              <Badge variant="secondary">{claimTotals.pendingCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="plans" className="gap-2">
            Payment plans
            {planTotals.pendingCount > 0 && (
              <Badge variant="secondary">{planTotals.pendingCount}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="payments" className="mt-6 space-y-6">
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <QueueTile label="Waiting" value={totals.pendingCount} />
            <QueueTile label="Unconfirmed" value={money(totals.pendingCents)} />
            <QueueTile
              label="Oldest"
              value={`${totals.oldestPendingDays}d`}
              danger={totals.oldestPendingDays >= 7}
            />
          </dl>

          {totals.oldestPendingDays >= 7 && (
            <Alert variant="warning">
              <TriangleAlert aria-hidden="true" />
              <AlertDescription>
                Something has been waiting {totals.oldestPendingDays} days.
                Nobody is marked late while their claim sits here, but they also
                can&apos;t see their balance clear.
              </AlertDescription>
            </Alert>
          )}

          <Card className="overflow-hidden">
            <CardContent className="p-0">
              {submissions.length === 0 ? (
                <QueueEmpty message="Nothing waiting. The queue is clear." />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-6">Member</TableHead>
                        <TableHead>Charge</TableHead>
                        <TableHead>Paid on</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Waiting</TableHead>
                        <TableHead className="pr-6">
                          <span className="sr-only">Actions</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {submissions.map((submission) => (
                        <TableRow key={submission._id}>
                          <TableCell className="pl-6">
                            <p className="font-semibold text-foreground">
                              {submission.member
                                ? `${submission.member.fName} ${submission.member.lName}`
                                : "Unknown"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              #{submission.member?.rollNo ?? "Unknown"}
                            </p>
                          </TableCell>
                          <TableCell>
                            <p className="text-sm">
                              {submission.charge?.description ?? "Unknown charge"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {submission.charge?.term}
                              {submission.reference &&
                                ` · ${submission.reference}`}
                            </p>
                          </TableCell>
                          <TableCell>
                            <p className="text-sm">
                              {dayLabel(submission.paidOn)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {submission.method}
                            </p>
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">
                            {money(submission.amountCents)}
                          </TableCell>
                          <TableCell>
                            <AgeBadge days={submission.ageDays} />
                          </TableCell>
                          <TableCell className="pr-6 text-right">
                            <Button
                              size="sm"
                              onClick={() => setReviewing(submission)}
                            >
                              Review
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reimbursements" className="mt-6">
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <ReimbursementList
                rows={claims?.reimbursements ?? []}
                onReview={setReviewingClaim}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="plans" className="mt-6">
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <PlanList
                rows={plans?.plans ?? []}
                onReview={setReviewingPlan}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {reviewingPlan && (
        <ReviewPlanModal
          plan={reviewingPlan}
          onClose={() => setReviewingPlan(null)}
          onReviewed={(message) => {
            setReviewingPlan(null);
            setFlash(message);
            load();
          }}
        />
      )}

      {reviewingClaim && (
        <ReviewReimbursementModal
          reimbursement={reviewingClaim}
          onClose={() => setReviewingClaim(null)}
          onReviewed={(message) => {
            setReviewingClaim(null);
            setFlash(message);
            load();
          }}
        />
      )}

      {reviewing && (
        <VerifyPaymentModal
          submission={reviewing}
          onClose={() => setReviewing(null)}
          onReviewed={(message) => {
            setReviewing(null);
            setFlash(message);
            load();
          }}
        />
      )}
    </PageContainer>
  );
}

function ReimbursementList({
  rows,
  onReview,
}: {
  rows: QueuedReimbursement[];
  onReview: (claim: QueuedReimbursement) => void;
}) {
  if (rows.length === 0) {
    return <QueueEmpty message="No claims waiting." />;
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-6">Member</TableHead>
            <TableHead>What for</TableHead>
            <TableHead>Receipts</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Waiting</TableHead>
            <TableHead className="pr-6">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((claim) => (
            <TableRow key={claim._id}>
              <TableCell className="pl-6">
                <p className="font-semibold text-foreground">
                  {claim.member
                    ? `${claim.member.fName} ${claim.member.lName}`
                    : "Unknown"}
                </p>
                <p className="text-xs text-muted-foreground">
                  #{claim.member?.rollNo ?? "\u2014"}
                </p>
              </TableCell>
              <TableCell>
                <p className="text-sm">{claim.description}</p>
                <p className="text-xs text-muted-foreground">{claim.category}</p>
              </TableCell>
              <TableCell>
                {claim.receiptUrls.length > 0 ? (
                  <Badge variant="muted">{claim.receiptUrls.length}</Badge>
                ) : (
                  <Badge variant="warning">none</Badge>
                )}
              </TableCell>
              <TableCell className="text-right font-semibold tabular-nums">
                {money(claim.amountCents)}
              </TableCell>
              <TableCell>
                <AgeBadge days={claim.ageDays} />
              </TableCell>
              <TableCell className="pr-6 text-right">
                <Button size="sm" onClick={() => onReview(claim)}>
                  Review
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/// Proposals waiting on an answer.
///
/// The due date each was filed against is the column that matters: a request
/// that beat the deadline is one the member is entitled to have considered, and
/// they are not being marked late while it sits here.
function PlanList({
  rows,
  onReview,
}: {
  rows: QueuedPlan[];
  onReview: (plan: QueuedPlan) => void;
}) {
  if (rows.length === 0) {
    return <QueueEmpty message="No plan requests waiting." />;
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-6">Member</TableHead>
            <TableHead>Asked for</TableHead>
            <TableHead>Filed against</TableHead>
            <TableHead className="text-right">Per month</TableHead>
            <TableHead>Waiting</TableHead>
            <TableHead className="pr-6">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((plan) => (
            <TableRow key={plan._id}>
              <TableCell className="pl-6">
                <p className="font-semibold text-foreground">
                  {plan.member
                    ? `${plan.member.fName} ${plan.member.lName}`
                    : "Unknown"}
                </p>
                <p className="text-xs text-muted-foreground">
                  #{plan.member?.rollNo ?? "\u2014"}
                </p>
              </TableCell>
              <TableCell>
                <p className="text-sm">
                  {money(plan.totalCents)} over {plan.installmentCount} months
                </p>
                {plan.requestNote && (
                  <p className="max-w-[16rem] truncate text-xs text-muted-foreground">
                    {plan.requestNote}
                  </p>
                )}
              </TableCell>
              <TableCell>
                <p className="text-sm">
                  {dayLabel(plan.proposedAgainstDueDate)}
                </p>
                <p className="text-xs text-muted-foreground">
                  filed {dayLabel(plan.proposedAt)}
                </p>
              </TableCell>
              <TableCell className="text-right font-semibold tabular-nums">
                {money(plan.installments[0]?.amountCents ?? 0)}
              </TableCell>
              <TableCell>
                <AgeBadge days={plan.ageDays} />
              </TableCell>
              <TableCell className="pr-6 text-right">
                <Button size="sm" onClick={() => onReview(plan)}>
                  Review
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
