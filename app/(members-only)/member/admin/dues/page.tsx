"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bell,
  CircleAlert,
  CircleCheck,
  Clock,
  Download,
  History,
  Plus,
  Search,
  TriangleAlert,
  X,
} from "lucide-react";

import LoadingState from "../../../components/LoadingState";
import { PageContainer, PageHeader } from "../../../components/shell/PageShell";
import { cn } from "@/lib/utils";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PayOutCreditModal from "./PayOutCreditModal";
import RemindModal from "./RemindModal";
import MemberHistorySheet from "./MemberHistoryModal";
import NewChargeSheet from "./NewChargeSheet";
import { exportAuditPdf } from "./exportAudit";

type RosterRow = {
  memberId: string;
  rollNo: string;
  fName: string;
  lName: string;
  status: string;
  assignedCents: number;
  paidCents: number;
  balanceCents: number;
  creditCents: number;
  chargeCount: number;
  nextDueDate: string | null;
  awaitingReview: boolean;
  isOverdue: boolean;
  /// The live plan needing most attention, present only while one is running.
  /// When it is, this member's "next due" is an installment, not the whole
  /// balance. A member can run several at once — `planCount` says how many.
  plan: {
    _id: string;
    planCount?: number;
    installmentCount: number;
    currentSeq: number | null;
    amountDueNowCents: number;
    dueNowDate: string | null;
    missedCount: number;
    isBehind: boolean;
  } | null;
};

type RosterResponse = {
  members: RosterRow[];
  totals: {
    outstandingCents: number;
    collectedCents: number;
    memberCount: number;
    owingCount: number;
    overdueCount: number;
    pendingReviewCount: number;
    creditOwedCents: number;
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

type Filter = "owing" | "overdue" | "credit" | "all";

export default function DuesRosterPage() {
  const [data, setData] = useState<RosterResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("owing");
  const [payingOut, setPayingOut] = useState<RosterRow | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [reminding, setReminding] = useState(false);
  const [viewingHistory, setViewingHistory] = useState<RosterRow | null>(null);
  const [creatingCharge, setCreatingCharge] = useState(false);
  const [exporting, setExporting] = useState(false);
  /// Settled card money nobody owns yet. Fetched separately from the roster
  /// because it is not a fact about any member, which is exactly what makes it
  /// easy to forget.
  const [unassigned, setUnassigned] = useState<{
    count: number;
    cents: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/terminal/payments?unassigned=true", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled || !data?.totals) return;
        setUnassigned({
          count: data.totals.unassignedCount ?? 0,
          cents: data.totals.unassignedCents ?? 0,
        });
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dues?view=roster");
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || "Couldn't load the roster");
      }
      setData(await res.json());
      setError(null);
    } catch (err: any) {
      setError(err.message || "Couldn't load the roster");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => {
    if (!data) return [];
    let list = data.members;
    if (filter === "owing") list = list.filter((row) => row.balanceCents > 0);
    if (filter === "overdue") list = list.filter((row) => row.isOverdue);
    if (filter === "credit") list = list.filter((row) => row.creditCents > 0);
    const needle = query.trim().toLowerCase();
    if (needle) {
      list = list.filter(
        (row) =>
          `${row.fName} ${row.lName}`.toLowerCase().includes(needle) ||
          row.rollNo.toLowerCase().includes(needle)
      );
    }
    return list;
  }, [data, filter, query]);

  if (loading) return <LoadingState message="Loading dues..." />;

  if (error || !data) {
    return (
      <PageContainer className="max-w-7xl space-y-4">
        <Alert variant="destructive" role="alert">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Couldn&apos;t load the roster</AlertTitle>
          <AlertDescription>
            {error || "Couldn't load the roster"}
          </AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => load()}>
          Try again
        </Button>
      </PageContainer>
    );
  }

  const { totals } = data;

  const tiles = [
    { label: "Outstanding", value: money(totals.outstandingCents) },
    { label: "Collected", value: money(totals.collectedCents) },
    { label: "Still owing", value: `${totals.owingCount}` },
    {
      label: "Overdue",
      value: `${totals.overdueCount}`,
      danger: totals.overdueCount > 0,
    },
    // The chapter's own debt, shown as plainly as the members'.
    { label: "Owed to members", value: money(totals.creditOwedCents ?? 0) },
  ];

  const FILTER_LABELS: Record<Filter, string> = {
    owing: "Owing",
    overdue: "Overdue",
    credit: "We owe them",
    all: "Everyone",
  };

  return (
    <PageContainer className="max-w-7xl space-y-6">
      <PageHeader
        title="Dues"
        description="Who owes what."
        actions={
          <>
            <Button onClick={() => setCreatingCharge(true)}>
              <Plus aria-hidden="true" />
              New charge
            </Button>
            <Button variant="outline" onClick={() => setReminding(true)}>
              <Bell aria-hidden="true" />
              Remind
            </Button>
            <Button
              variant="outline"
              disabled={exporting}
              onClick={async () => {
                setExporting(true);
                try {
                  const res = await fetch("/api/dues/export");
                  const payload = await res.json();
                  if (!res.ok)
                    throw new Error(
                      payload?.error || "Couldn't build the export"
                    );
                  await exportAuditPdf(payload);
                } catch (err: any) {
                  setFlash(err.message || "Couldn't build the export");
                } finally {
                  setExporting(false);
                }
              }}
            >
              <Download aria-hidden="true" />
              {exporting ? "Building…" : "Export"}
            </Button>
            <Button variant="outline" asChild>
              <Link href="/member/admin/dues/requests" className="no-underline">
                Requests
                {totals.pendingReviewCount > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {totals.pendingReviewCount}
                  </Badge>
                )}
              </Link>
            </Button>
          </>
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

      {unassigned && unassigned.count > 0 ? (
        <Alert>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>
              <strong className="tabular-nums">
                {(unassigned.cents / 100).toLocaleString("en-US", {
                  style: "currency",
                  currency: "USD",
                })}
              </strong>{" "}
              taken in person has no owner yet, across {unassigned.count}{" "}
              payment{unassigned.count === 1 ? "" : "s"}.
            </span>
            <Button size="sm" variant="outline" asChild>
              <a href="/member/admin/dues/unassigned">Assign it</a>
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="rounded-lg border border-border bg-card p-4"
          >
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {tile.label}
            </dt>
            <dd
              className={cn(
                "mt-1 text-xl font-semibold tabular-nums",
                tile.danger ? "text-destructive" : "text-foreground"
              )}
            >
              {tile.value}
            </dd>
          </div>
        ))}
      </dl>

      <Card className="overflow-hidden">
        <CardHeader className="gap-4 border-b lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1.5">
            <CardTitle>Chapter roster</CardTitle>
            <CardDescription>
              {rows.length} member{rows.length === 1 ? "" : "s"} in this view.
            </CardDescription>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Tabs
              value={filter}
              onValueChange={(value) => setFilter(value as Filter)}
            >
              <TabsList className="h-auto flex-wrap">
                {(["owing", "overdue", "credit", "all"] as Filter[]).map(
                  (option) => (
                    <TabsTrigger key={option} value={option}>
                      {FILTER_LABELS[option]}
                    </TabsTrigger>
                  )
                )}
              </TabsList>
            </Tabs>

            <div className="flex h-10 min-w-0 items-center gap-2 rounded-md border border-input bg-background px-3 ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 sm:w-64">
              <Search
                aria-hidden="true"
                className="h-4 w-4 shrink-0 text-muted-foreground"
              />
              <input
                type="search"
                placeholder="Name or roll number"
                aria-label="Search the dues roster"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="m-0 h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:appearance-none"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear dues search"
                  className="-mr-1 flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Member</TableHead>
                  <TableHead className="text-right">Assigned</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead>Next due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-6 text-right">History</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length ? (
                  rows.map((row) => (
                    <TableRow key={row.memberId}>
                      <TableCell className="pl-6">
                        <div>
                          <span className="block font-semibold text-foreground">
                            {row.fName} {row.lName}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            #{row.rollNo}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(row.assignedCents)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {money(row.paidCents)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {row.balanceCents > 0 ? money(row.balanceCents) : money(0)}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.creditCents > 0 ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPayingOut(row)}
                            className="tabular-nums"
                          >
                            {money(row.creditCents)}
                            <span className="sr-only">
                              {`, pay out credit to ${row.fName} ${row.lName}`}
                            </span>
                          </Button>
                        ) : (
                          money(0)
                        )}
                      </TableCell>
                      <TableCell>
                        {row.plan ? (
                          <>
                            <span className="block text-sm">
                              {dayLabel(row.plan.dueNowDate)}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {money(row.plan.amountDueNowCents)} · installment{" "}
                              {row.plan.currentSeq ?? row.plan.installmentCount}{" "}
                              of {row.plan.installmentCount}
                            </span>
                          </>
                        ) : (
                          <span className="text-sm">
                            {dayLabel(row.nextDueDate)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          {row.awaitingReview && (
                            <Badge variant="muted">
                              <Clock className="size-3" />
                              In review
                            </Badge>
                          )}
                          {row.plan && !row.plan.isBehind && (
                            <Badge variant="secondary">
                              {(row.plan.planCount ?? 1) > 1
                                ? `On ${row.plan.planCount} plans`
                                : "On a plan"}
                            </Badge>
                          )}
                          {row.plan && row.plan.isBehind && (
                            <Badge variant="destructive">
                              {row.plan.missedCount} missed
                            </Badge>
                          )}
                          {row.isOverdue && !row.plan && (
                            <Badge variant="destructive">
                              <TriangleAlert className="size-3" />
                              Overdue
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="pr-6 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="whitespace-nowrap"
                          onClick={() => setViewingHistory(row)}
                        >
                          <History aria-hidden="true" />
                          View history
                          <span className="sr-only">
                            {` for ${row.fName} ${row.lName}`}
                          </span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="h-40 text-center">
                      <p className="font-medium">Nobody matches that</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Try a different filter or search.
                      </p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {viewingHistory && (
        <MemberHistorySheet
          rollNo={viewingHistory.rollNo}
          name={`${viewingHistory.fName} ${viewingHistory.lName}`}
          onClose={() => setViewingHistory(null)}
          onChanged={() => void load()}
        />
      )}
      {creatingCharge ? (
        <NewChargeSheet
          members={data.members.filter((member) => member.status === "Active")}
          onClose={() => setCreatingCharge(false)}
          onCreated={(message) => {
            setCreatingCharge(false);
            setFlash(message);
            void load();
          }}
        />
      ) : null}
      {reminding && (
        <RemindModal
          onClose={() => setReminding(false)}
          onSent={(message) => {
            setReminding(false);
            setFlash(message);
            load();
          }}
        />
      )}
      {payingOut && (
        <PayOutCreditModal
          member={{
            memberId: payingOut.memberId,
            rollNo: payingOut.rollNo,
            name: `${payingOut.fName} ${payingOut.lName}`,
            creditCents: payingOut.creditCents,
          }}
          onClose={() => setPayingOut(null)}
          onPaid={(message) => {
            setPayingOut(null);
            setFlash(message);
            load();
          }}
        />
      )}
    </PageContainer>
  );
}
