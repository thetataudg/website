"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Heart, TriangleAlert } from "lucide-react";

import LoadingState from "../../../components/LoadingState";
import { PageContainer, PageHeader } from "../../../components/shell/PageShell";
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

type Donation = {
  _id: string;
  amountCents: number;
  refundedCents: number;
  designation: string;
  designationLabel: string;
  message: string;
  isAnonymous: boolean;
  channel: string;
  donorName: string;
  donorEmail: string;
  status: string;
  paidAt: string | null;
  acknowledgedAt: string | null;
  receiptSentAt: string | null;
  canEmail: boolean;
  member: { rollNo: string; fName: string; lName: string } | null;
};

type Totals = {
  currency: string;
  netCents: number;
  grossCents: number;
  refundedCents: number;
  count: number;
  byDesignation: Array<{
    designation: string;
    label: string;
    netCents: number;
    count: number;
  }>;
};

function money(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
      {hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/// How the donor should be referred to in the room.
///
/// A member's own name always wins over whatever they typed, and "anonymous" is
/// shown as a badge rather than by hiding the name: the promise is about
/// publication, not about the chapter's own books, and the treasurer is the
/// person who may one day have to answer the bank about this row.
function donorName(row: Donation) {
  if (row.member) return `${row.member.fName} ${row.member.lName}`;
  return row.donorName || "Not given";
}

export default function DonationsPage() {
  const [donations, setDonations] = useState<Donation[] | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [onlyUnthanked, setOnlyUnthanked] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/donations", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Couldn't load donations");
      setDonations(data.donations ?? []);
      setTotals(data.totals ?? null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function patch(row: Donation, body: Record<string, unknown>) {
    setBusyId(row._id);
    setError(null);
    try {
      const response = await fetch(`/api/donations/${row._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data?.error || "Couldn't update that gift");
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  const visible = useMemo(() => {
    const rows = donations ?? [];
    return onlyUnthanked ? rows.filter((row) => !row.acknowledgedAt) : rows;
  }, [donations, onlyUnthanked]);

  const unthankedCount = (donations ?? []).filter(
    (row) => !row.acknowledgedAt && row.status === "succeeded"
  ).length;

  if (loading) return <LoadingState message="Loading donations..." />;

  if (error && !donations) {
    return (
      <PageContainer className="max-w-7xl space-y-4">
        <Alert variant="destructive" role="alert">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => load()}>
          Try again
        </Button>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="max-w-7xl space-y-6">
      <PageHeader
        title="Donations"
        description="Gifts to the chapter. These never touch anybody's dues balance."
        actions={
          <Button variant="outline" asChild>
            <a href="/api/donations/export">
              <Download aria-hidden="true" />
              Export CSV
            </a>
          </Button>
        }
      />

      <div aria-live="polite" className="empty:hidden">
        {error ? (
          <Alert variant="destructive" role="alert">
            <TriangleAlert aria-hidden="true" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </div>

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Received"
          value={money(totals?.netCents ?? 0)}
          hint={`${totals?.count ?? 0} gift${totals?.count === 1 ? "" : "s"}`}
        />
        <Stat
          label="Refunded"
          value={money(totals?.refundedCents ?? 0)}
        />
        <Stat
          label="Not yet thanked"
          value={String(unthankedCount)}
          hint={
            unthankedCount
              ? "Somebody gave and has not heard back."
              : "Everyone has been thanked."
          }
        />
        <Stat
          label="Largest fund"
          value={
            totals?.byDesignation?.length
              ? [...totals.byDesignation].sort((a, b) => b.netCents - a.netCents)[0]
                  .label
              : "None yet"
          }
        />
      </dl>

      {totals?.byDesignation?.length ? (
        <Card>
          <CardContent className="flex flex-wrap gap-x-8 gap-y-3 p-4">
            {totals.byDesignation.map((fund) => (
              <div key={fund.designation}>
                <p className="text-xs text-muted-foreground">{fund.label}</p>
                <p className="font-medium tabular-nums">
                  {money(fund.netCents)}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    ({fund.count})
                  </span>
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="flex items-center gap-2">
        <Button
          variant={onlyUnthanked ? "default" : "outline"}
          size="sm"
          onClick={() => setOnlyUnthanked((value) => !value)}
        >
          Needs a thank-you{unthankedCount ? ` (${unthankedCount})` : ""}
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {visible.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <div className="rounded-full bg-muted p-3">
                <Heart className="size-5 text-muted-foreground" aria-hidden="true" />
              </div>
              <p className="text-sm text-muted-foreground">
                {onlyUnthanked
                  ? "Everyone who gave has been thanked."
                  : "No gifts yet."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Donor</TableHead>
                  <TableHead>Fund</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead className="text-right">Thanked</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((row) => (
                  <TableRow key={row._id}>
                    <TableCell>
                      <div className="font-medium">{donorName(row)}</div>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        {row.member ? <span>#{row.member.rollNo}</span> : null}
                        {row.donorEmail ? <span>{row.donorEmail}</span> : null}
                        {row.isAnonymous ? (
                          <Badge variant="muted">Anonymous publicly</Badge>
                        ) : null}
                        <Badge variant="muted">{row.channel}</Badge>
                      </div>
                    </TableCell>
                    <TableCell>{row.designationLabel}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(row.amountCents)}
                      {row.refundedCents > 0 ? (
                        <div className="text-xs text-muted-foreground">
                          {money(row.refundedCents)} refunded
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {row.paidAt
                        ? new Date(row.paidAt).toLocaleDateString("en-US", {
                            timeZone: "America/Phoenix",
                          })
                        : "-"}
                    </TableCell>
                    <TableCell className="max-w-[24ch] truncate" title={row.message}>
                      {row.message || (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end gap-1">
                        {row.acknowledgedAt ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyId === row._id}
                            onClick={() => patch(row, { acknowledged: false })}
                          >
                            Thanked
                          </Button>
                        ) : row.canEmail ? (
                          <Button
                            size="sm"
                            disabled={busyId === row._id}
                            onClick={() => patch(row, { sendThankYou: true })}
                          >
                            Send thank-you
                          </Button>
                        ) : (
                          // No address to write to. Marking it is the only
                          // honest option, and it says a human did the work.
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busyId === row._id}
                            onClick={() => patch(row, { acknowledged: true })}
                          >
                            Mark thanked
                          </Button>
                        )}
                        {row.receiptSentAt ? (
                          <span className="text-xs text-muted-foreground">
                            Emailed
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
