"use client";

import { useCallback, useEffect, useState } from "react";
import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import {
  CalendarDays,
  CircleAlert,
  CircleCheck,
  Clock,
  History,
  Landmark,
  Receipt,
  TriangleAlert,
} from "lucide-react";

import LoadingState from "../../components/LoadingState";
import { PageContainer, PageHeader, SectionHeader } from "../../components/shell/PageShell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import MarkAsPaidModal, { PayableCharge } from "./MarkAsPaidModal";
import SubmitReimbursementModal from "./SubmitReimbursementModal";
import RequestPlanModal from "./RequestPlanModal";
import FinanceTimeline from "./FinanceTimeline";
import { maxInstallmentsFor } from "@/lib/planMath";

type Charge = {
  _id: string;
  term: string;
  description: string;
  category: string;
  amountCents: number;
  paidCents: number;
  balanceCents: number;
  dueDate: string | null;
  status: string;
  isOverdue: boolean;
};

type Submission = {
  _id: string;
  chargeId: string;
  amountCents: number;
  method: string;
  paidOn: string | null;
  submittedAt: string | null;
  status: string;
  reviewNote: string;
};

type Reimbursement = {
  _id: string;
  amountCents: number;
  description: string;
  category: string;
  purchasedOn: string | null;
  status: string;
  reviewNote: string;
  submittedAt: string | null;
};

type Installment = {
  seq: number;
  dueDate: string | null;
  amountCents: number;
  paidCents: number;
  remainingCents: number;
  status: string;
};

type Plan = {
  _id: string;
  status: string;
  chargeIds?: string[];
  term?: string;
  totalCents: number;
  paidCents: number;
  remainingCents: number;
  installmentCount: number;
  installments: Installment[];
  currentSeq: number | null;
  amountDueNowCents: number;
  dueNowDate: string | null;
  missedCount: number;
  requestNote: string;
  reviewNote: string;
  graceUntil: string | null;
};

type DuesResponse = {
  currency: string;
  balanceCents: number;
  paidCents: number;
  amountDueNowCents: number;
  dueNowDate: string | null;
  creditCents: number;
  hasOverdue: boolean;
  awaitingReview: boolean;
  pendingCents: number;
  charges: Charge[];
  submissions: Submission[];
  plan: Plan | null;
  /// Several plans can run at once, one per set of charges.
  plans?: Plan[];
  /// Paid off, denied or cancelled — kept readable, out of the way.
  archivedPlans?: Plan[];
  /// Charges no live plan covers, so a new plan can still be proposed for them.
  planEligibleChargeIds?: string[];
  awaitingPlanReview: boolean;
  nextDueDate: string | null;
  awaitingOnlinePayment?: boolean;
  onlineProcessingCents?: number;
};

function money(cents: number) {
  const abs = Math.abs(cents);
  const body = (abs / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: abs % 100 === 0 ? 0 : 2,
  });
  return cents < 0 ? `-${body}` : body;
}

function dayLabel(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Phoenix",
  });
}

const INSTALLMENT_BADGES: Record<
  string,
  { variant: "default" | "secondary" | "destructive" | "outline" | "success" | "muted"; label: string }
> = {
  paid: { variant: "success", label: "Paid" },
  due: { variant: "default", label: "Due" },
  late: { variant: "destructive", label: "Late" },
  waived: { variant: "secondary", label: "Waived" },
  upcoming: { variant: "outline", label: "Upcoming" },
};

function InstallmentBadge({ status }: { status: string }) {
  const badge = INSTALLMENT_BADGES[status] ?? INSTALLMENT_BADGES.upcoming;
  return <Badge variant={badge.variant}>{badge.label}</Badge>;
}

export default function DuesPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const [data, setData] = useState<DuesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState<PayableCharge | null>(null);
  const [onlinePaymentNoticeOpen, setOnlinePaymentNoticeOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([]);
  const [flash, setFlash] = useState<string | null>(null);
  /// A payment report the member is taking back. Only ever a pending one —
  /// once an officer has answered it, the answer is part of the record.
  const [withdrawing, setWithdrawing] = useState<Submission | null>(null);
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dues/me");
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || "Couldn't load your dues");
      }
      setData(await res.json());
      setError(null);

      // A secondary panel — a failure here shouldn't blank out the balance,
      // which is what people actually came for.
      try {
        const claims = await fetch("/api/reimbursements?mine=1");
        if (claims.ok) {
          const payload = await claims.json();
          setReimbursements(payload.reimbursements ?? []);
        }
      } catch {
        /* leave the panel empty */
      }
    } catch (err: any) {
      setError(err.message || "Couldn't load your dues");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isLoaded && isSignedIn) load();
  }, [isLoaded, isSignedIn, load]);

  async function withdrawClaim(submission: Submission) {
    setWithdrawBusy(true);
    setWithdrawError(null);
    try {
      const res = await fetch(`/api/dues/submissions/${submission._id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || "That claim could not be withdrawn");
      }
      await load();
      setWithdrawing(null);
      setFlash("Payment report withdrawn.");
    } catch (err: any) {
      setWithdrawError(err.message || "That claim could not be withdrawn");
    } finally {
      setWithdrawBusy(false);
    }
  }

  if (!isLoaded) return <LoadingState message="Loading..." />;
  if (!isSignedIn) return <RedirectToSignIn />;
  if (loading) return <LoadingState message="Loading your dues..." />;

  if (error || !data) {
    return (
      <PageContainer className="max-w-3xl space-y-4">
        <Alert variant="destructive" role="alert">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Couldn&apos;t load your dues</AlertTitle>
          <AlertDescription>
            {error || "Couldn't load your dues"}
          </AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => load()}>
          Try again
        </Button>
      </PageContainer>
    );
  }

  const pendingByCharge = new Map(
    data.submissions
      .filter((submission) => submission.status === "pending")
      .map((submission) => [submission.chargeId, submission])
  );
  const outstanding = data.charges.filter((charge) => charge.balanceCents > 0);
  const settled = data.charges.filter((charge) => charge.balanceCents === 0);

  // Exactly one of these is ever true: credit auto-applies to open charges, so
  // owing money and holding credit can't both be the case.
  const owes = data.amountDueNowCents > 0;
  const holdsCredit = !owes && data.creditCents > 0;

  // `plans` is the plural field; `plan` is what older responses carried. Fall
  // back so a cached payload still renders.
  const livePlans = data.plans ?? (data.plan ? [data.plan] : []);
  const archivedPlans = data.archivedPlans ?? [];
  const activePlans = livePlans.filter((row) => row.status === "active");
  const pendingPlans = livePlans.filter((row) => row.status === "pending");
  // A denial is archived immediately, but the member still needs to be told —
  // and only for as long as their five-day grace window lasts.
  const deniedInGrace = archivedPlans.filter(
    (row) =>
      row.status === "denied" &&
      (!row.graceUntil || new Date(row.graceUntil) >= new Date())
  );
  // A plan can only be asked for before the earliest due date passes, and only
  // if the balance is big enough to split. Offering a button that leads to a
  // refusal is worse than not offering one.
  //
  // What a *new* plan could cover: everything owed that no live plan already
  // speaks for. A member with one plan running can still put a later charge on
  // a second one — the rule is one plan per charge, not one plan per member.
  const plannedChargeIds = new Set(
    livePlans.flatMap((row) => row.chargeIds ?? [])
  );
  const eligible = outstanding.filter(
    (charge) =>
      charge.balanceCents > 0 &&
      (data.planEligibleChargeIds
        ? data.planEligibleChargeIds.includes(charge._id)
        : !plannedChargeIds.has(charge._id))
  );
  // With several plans on screen, "Your payment plan" stops being an identifier.
  // Name each one by what it actually covers.
  const planLabel = (row: Plan) => {
    const names = (row.chargeIds ?? [])
      .map((id) => data.charges.find((charge) => charge._id === id)?.description)
      .filter(Boolean) as string[];
    if (!names.length) return "Your payment plan";
    const unique = Array.from(new Set(names));
    return unique.length === 1 ? unique[0] : `${unique[0]} +${unique.length - 1} more`;
  };

  const eligibleCents = eligible.reduce(
    (sum, charge) => sum + charge.balanceCents,
    0
  );
  const canRequestPlan =
    eligible.length > 0 &&
    eligibleCents > 0 &&
    maxInstallmentsFor(eligibleCents) >= 2 &&
    !data.hasOverdue &&
    !data.awaitingReview;

  return (
    <PageContainer className="max-w-5xl space-y-6">
      <PageHeader
        className="mb-0"
        title="Dues"
        description="Your balance, payments, and chapter reimbursements in one place."
        actions={
          <Button variant="outline" onClick={() => setHistoryOpen(true)}>
            <History aria-hidden="true" />
            Transaction history
          </Button>
        }
      />

      <div aria-live="polite" className="empty:hidden">
        {flash && (
          <Alert variant="success">
            <CircleCheck aria-hidden="true" />
            <AlertDescription>{flash}</AlertDescription>
          </Alert>
        )}
      </div>

      <Card className="overflow-hidden">
        <CardContent className="grid p-0 md:grid-cols-[minmax(0,1.6fr)_minmax(16rem,0.9fr)]">
          <div className="p-6 sm:p-8">
            {owes ? (
              <>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Due now
                </div>
                <div className="mt-1 text-4xl font-semibold tracking-tight text-foreground">
                  {money(data.amountDueNowCents)}
                </div>
                {data.dueNowDate ? (
                  <div
                    className={
                      data.hasOverdue
                        ? "mt-2 flex items-center gap-1.5 text-sm font-medium text-destructive"
                        : "mt-2 text-sm text-muted-foreground"
                    }
                  >
                    {data.hasOverdue ? (
                      <TriangleAlert aria-hidden="true" className="size-4" />
                    ) : null}
                    {data.hasOverdue ? "Was due " : "Due "}
                    {dayLabel(data.dueNowDate)}
                  </div>
                ) : null}
                {activePlans.length > 0 &&
                data.balanceCents > data.amountDueNowCents ? (
                  <div className="mt-2 text-sm text-muted-foreground">
                    {money(data.balanceCents)} owed in total across{" "}
                    {activePlans.length === 1
                      ? `a ${activePlans[0].installmentCount}-month plan`
                      : `${activePlans.length} payment plans`}
                  </div>
                ) : null}
              </>
            ) : holdsCredit ? (
              <>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  The chapter owes you
                </div>
                <div className="mt-1 text-4xl font-semibold tracking-tight text-emerald-700 dark:text-emerald-400">
                  {money(data.creditCents)}
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  This credit is automatically applied to your next charge.
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 text-3xl font-semibold tracking-tight text-emerald-700 dark:text-emerald-400">
                  <span className="flex size-10 items-center justify-center rounded-full bg-emerald-500/10">
                    <CircleCheck aria-hidden="true" className="size-6" />
                  </span>
                  All settled
                </div>
                <div className="mt-3 text-sm text-muted-foreground">
                  You have no outstanding charges or payments awaiting action.
                </div>
              </>
            )}

            <dl className="mt-7 grid grid-cols-2 gap-4 border-t pt-5 sm:grid-cols-3">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Current balance
                </dt>
                <dd className="mt-1 font-semibold tabular-nums text-foreground">
                  {money(data.balanceCents)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Paid to date
                </dt>
                <dd className="mt-1 font-semibold tabular-nums text-foreground">
                  {money(data.paidCents)}
                </dd>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Charges settled
                </dt>
                <dd className="mt-1 font-semibold tabular-nums text-foreground">
                  {settled.length}
                </dd>
              </div>
            </dl>
          </div>

          <div className="border-t bg-muted/30 p-6 md:border-l md:border-t-0 sm:p-8">
            <h2 className="font-semibold text-foreground">Manage your account</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Pay a balance, request a plan, or submit money the chapter owes you.
            </p>
            <div className="mt-5 grid gap-2">
              {owes && !data.awaitingOnlinePayment ? (
                <Button
                  className="w-full justify-start"
                  onClick={() => setOnlinePaymentNoticeOpen(true)}
                >
                  <Landmark aria-hidden="true" />
                  Pay online
                </Button>
              ) : null}
              {canRequestPlan ? (
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => setPlanning(true)}
                >
                  <CalendarDays aria-hidden="true" />
                  Ask to pay in installments
                </Button>
              ) : null}
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => setClaiming(true)}
              >
                <Receipt aria-hidden="true" />
                Claim a reimbursement
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {pendingPlans.map((plan) => (
        <Alert key={plan._id} variant="info" className="mb-4">
          <Clock aria-hidden="true" />
          <AlertTitle>
            Plan request for {money(plan.totalCents)} over{" "}
            {plan.installmentCount} months is with the treasurer.
          </AlertTitle>
          <AlertDescription>
            You asked before your due date, so you won&apos;t be marked late or
            reminded while it&apos;s in the queue. Nothing is agreed until
            it&apos;s approved.
          </AlertDescription>
        </Alert>
      ))}

      {deniedInGrace.map((plan) => (
        <Alert key={plan._id} variant="warning" className="mb-4">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Your plan request wasn&apos;t approved.</AlertTitle>
          <AlertDescription>
            {plan.reviewNote && <span className="block">{plan.reviewNote}</span>}
            <span className="block">
              The full {money(plan.totalCents)} is owed
              {plan.graceUntil && ` by ${dayLabel(plan.graceUntil)}`}. Talk to
              the treasurer if that isn&apos;t workable.
            </span>
          </AlertDescription>
        </Alert>
      ))}

      {activePlans.map((activePlan) => (
        <Card key={activePlan._id} className="mb-4">
          <CardContent className="pt-6">
            <SectionHeader
              className="mb-3 items-start sm:items-start"
              title={
                activePlans.length > 1
                  ? planLabel(activePlan)
                  : "Your payment plan"
              }
              description={`${money(activePlan.paidCents)} of ${money(
                activePlan.totalCents
              )} paid · ${activePlan.installmentCount} installments`}
              actions={
                activePlan.missedCount > 0 ? (
                  <Badge variant="destructive">
                    {activePlan.missedCount} missed
                  </Badge>
                ) : null
              }
            />

            <Progress
              className="mb-3 h-1.5"
              aria-label="Plan progress"
              value={Math.min(
                100,
                Math.round(
                  (activePlan.paidCents /
                    Math.max(1, activePlan.totalCents)) *
                    100
                )
              )}
            />

            <ul className="divide-y divide-border">
              {activePlan.installments.map((installment) => (
                <li
                  key={installment.seq}
                  className="flex items-center justify-between gap-2 py-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <InstallmentBadge status={installment.status} />
                    <span
                      className={
                        installment.status === "paid"
                          ? "text-muted-foreground"
                          : "text-foreground"
                      }
                    >
                      {dayLabel(installment.dueDate)}
                    </span>
                  </span>
                  <span
                    className={
                      installment.status === "paid"
                        ? "text-muted-foreground line-through"
                        : "font-semibold text-foreground"
                    }
                  >
                    {money(installment.amountCents)}
                    {installment.remainingCents > 0 &&
                      installment.paidCents > 0 && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {money(installment.remainingCents)} left
                        </span>
                      )}
                  </span>
                </li>
              ))}
            </ul>

            {activePlan.missedCount > 0 && (
              <p className="mb-0 mt-3 text-sm text-muted-foreground">
                A missed installment doesn&apos;t cancel your plan or make the
                whole balance due. You&apos;re asked for what you&apos;re
                behind on, nothing more.
              </p>
            )}
          </CardContent>
        </Card>
      ))}

      {archivedPlans.length > 0 && (
        <section className="mb-4">
          <SectionHeader className="mb-2" title="Finished plans" as="h2" />
          <ul className="divide-y divide-border rounded-lg border border-border">
            {archivedPlans.map((row) => (
              <li
                key={row._id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
              >
                <span className="min-w-0">
                  <span className="text-sm text-muted-foreground">
                    {planLabel(row)}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {row.installmentCount} installments &middot;{" "}
                    {money(row.totalCents)}
                  </span>
                </span>
                <Badge variant="secondary">
                  {row.status === "denied"
                    ? "Not approved"
                    : row.status === "cancelled"
                      ? "Cancelled"
                      : "Paid off"}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.awaitingReview && (
        <Alert variant="info" className="mb-4">
          <Clock aria-hidden="true" />
          <AlertTitle>
            {money(data.pendingCents)} waiting to be checked off.
          </AlertTitle>
          <AlertDescription>
            You reported this, and the treasurer hasn&apos;t confirmed it yet.
            You won&apos;t be marked late or reminded about it while it&apos;s
            in the queue.
          </AlertDescription>
        </Alert>
      )}

      {data.awaitingOnlinePayment ? (
        <Alert variant="info" className="mb-4">
          <Clock aria-hidden="true" />
          <AlertTitle>
            {money(data.onlineProcessingCents ?? 0)} bank payment processing.
          </AlertTitle>
          <AlertDescription>
            Bank payments can take several business days. Your balance updates
            automatically when Stripe confirms the payment.
          </AlertDescription>
        </Alert>
      ) : null}

      {outstanding.length > 0 ? (
        <Card className="overflow-hidden">
          <CardHeader className="border-b">
            <CardTitle>Outstanding charges</CardTitle>
            <CardDescription>
              Items that still need payment or treasurer review.
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y divide-border p-0">
            {outstanding.map((charge) => {
              const pending = pendingByCharge.get(charge._id);
              return (
                <div key={charge._id} className="px-6 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-foreground">
                        {charge.description}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {charge.term}
                        {charge.dueDate && ` · due ${dayLabel(charge.dueDate)}`}
                        {charge.paidCents > 0 &&
                          ` · ${money(charge.paidCents)} paid so far`}
                      </div>
                      {charge.isOverdue && (
                        <div className="mt-1 flex items-center gap-1.5 text-sm font-medium text-destructive">
                          <TriangleAlert
                            aria-hidden="true"
                            className="size-3.5"
                          />
                          Past due
                        </div>
                      )}
                      {pending && (
                        <div className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
                          <Clock
                            aria-hidden="true"
                            className="mt-0.5 size-3.5 shrink-0"
                          />
                          <span>
                            {money(pending.amountCents)} reported{" "}
                            {pending.paidOn &&
                              `for ${dayLabel(pending.paidOn)}`}{" "}
                            , waiting on the treasurer
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="-my-1 h-7 shrink-0 px-2 text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              setWithdrawError(null);
                              setWithdrawing(pending);
                            }}
                          >
                            Withdraw
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-lg font-semibold text-foreground">
                        {money(charge.balanceCents)}
                      </div>
                      {!pending && !data.awaitingOnlinePayment ? (
                        <div className="mt-1 flex flex-col gap-1.5 sm:flex-row">
                          <Button
                            size="sm"
                            onClick={() => setOnlinePaymentNoticeOpen(true)}
                          >
                            Pay online
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setPaying({
                                _id: charge._id,
                                description: charge.description,
                                term: charge.term,
                                balanceCents: charge.balanceCents,
                              })
                            }
                          >
                            Report offline payment
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      {settled.length > 0 ? (
        <Card className="overflow-hidden">
          <CardHeader className="border-b">
            <CardTitle>Settled charges</CardTitle>
            <CardDescription>
              {settled.length} completed charge{settled.length === 1 ? "" : "s"} on your account.
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y divide-border p-0">
            {settled.map((charge) => (
              <div
                key={charge._id}
                className="flex items-center justify-between gap-4 px-6 py-4"
              >
                <div className="min-w-0">
                  <div className="font-medium text-foreground">
                    {charge.description}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {charge.term}
                    {charge.status !== "open" && ` · ${charge.status}`}
                  </div>
                </div>
                <span className="flex shrink-0 items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400">
                  <CircleCheck aria-hidden="true" className="size-4" />
                  {money(charge.amountCents)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {reimbursements.length > 0 ? (
        <Card className="overflow-hidden">
          <CardHeader className="border-b">
            <CardTitle>Reimbursement claims</CardTitle>
            <CardDescription>
              Purchases you submitted for the chapter to review.
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y divide-border p-0">
            {reimbursements.map((claim) => (
              <div key={claim._id} className="px-6 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-foreground">
                      {claim.description}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {claim.purchasedOn && dayLabel(claim.purchasedOn)}
                      {" · "}
                      {claim.category}
                    </div>
                    {claim.status === "denied" && claim.reviewNote && (
                      <div className="mt-1 text-sm text-destructive">
                        Denied: {claim.reviewNote}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <div className="font-semibold text-foreground">
                      {money(claim.amountCents)}
                    </div>
                    <Badge
                      variant={
                        claim.status === "approved"
                          ? "success"
                          : claim.status === "denied"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {claim.status}
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {/* History stays in a sheet so the balance and current actions remain the
          page's focus. It only loads when the member opens it. */}
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent
          side="right"
          className="grid w-full grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-2xl"
        >
          <SheetHeader className="border-b border-border px-6 py-5 pr-12">
            <SheetTitle>Your history</SheetTitle>
            <SheetDescription>
              Every charge, payment, claim and reminder on your record.
            </SheetDescription>
          </SheetHeader>
          <div className="overflow-y-auto px-6 py-5">
            <FinanceTimeline endpoint="/api/dues/history/me" bare />
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={!!withdrawing}
        onOpenChange={(open) => {
          if (!open) {
            setWithdrawing(null);
            setWithdrawError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Withdraw this payment report?</AlertDialogTitle>
            <AlertDialogDescription>
              {withdrawing
                ? `The ${money(withdrawing.amountCents)} you reported will be taken out of the treasurer's queue. You can report it again afterwards.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {withdrawError ? (
            <Alert variant="destructive">
              <CircleAlert aria-hidden="true" />
              <AlertDescription>{withdrawError}</AlertDescription>
            </Alert>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={withdrawBusy}
              onClick={() => withdrawing && withdrawClaim(withdrawing)}
            >
              {withdrawBusy ? "Withdrawing…" : "Withdraw it"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {claiming && (
        <SubmitReimbursementModal
          onClose={() => setClaiming(false)}
          onFiled={() => {
            setClaiming(false);
            setFlash("Claim sent. The treasurer will review it.");
            load();
          }}
        />
      )}

      {planning && (
        <RequestPlanModal
          balance={{
            term: eligible[0]?.term ?? outstanding[0]?.term ?? "",
            charges: eligible.map((charge) => ({
              _id: charge._id,
              description: charge.description,
              balanceCents: charge.balanceCents,
              dueDate: charge.dueDate,
            })),
          }}
          onClose={() => setPlanning(false)}
          onFiled={() => {
            setPlanning(false);
            setFlash(
              "Request sent. You asked in time, so you won't be marked late while the treasurer looks at it."
            );
            load();
          }}
        />
      )}

      {paying && (
        <MarkAsPaidModal
          charge={paying}
          onClose={() => setPaying(null)}
          onFiled={() => {
            setPaying(null);
            setFlash(
              "Sent. The treasurer will confirm it. You're covered from the date you entered."
            );
            load();
          }}
        />
      )}

      <AlertDialog
        open={onlinePaymentNoticeOpen}
        onOpenChange={setOnlinePaymentNoticeOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="mb-2 flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Landmark aria-hidden="true" className="size-5" />
            </div>
            <AlertDialogTitle>Online payments are coming soon</AlertDialogTitle>
            <AlertDialogDescription>
              We&apos;re still finalizing this payment method. For now, please
              use <span className="font-medium text-foreground">Report offline payment</span>{" "}
              to record a payment made by Zelle, Venmo, cash, physical check,
              or another offline method.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Got it</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
