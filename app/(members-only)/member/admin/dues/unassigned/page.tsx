"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleCheck, HandCoins, TriangleAlert } from "lucide-react";

import LoadingState from "../../../../components/LoadingState";
import { PageContainer, PageHeader } from "../../../../components/shell/PageShell";
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

type Payment = {
  _id: string;
  principalCents: number;
  description: string;
  note: string;
  payerName: string;
  cardBrand: string;
  last4: string;
  paidAt: string | null;
  status: string;
  operator: { rollNo: string; fName: string; lName: string } | null;
};

type RosterRow = {
  memberId: string;
  rollNo: string;
  fName: string;
  lName: string;
  balanceCents: number;
};

function money(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function daysSince(iso: string | null) {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export default function UnassignedPage() {
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [paymentsRes, rosterRes] = await Promise.all([
        fetch("/api/terminal/payments?unassigned=true", { cache: "no-store" }),
        fetch("/api/dues?view=roster", { cache: "no-store" }),
      ]);
      const paymentsData = await paymentsRes.json();
      if (!paymentsRes.ok) {
        throw new Error(paymentsData?.error || "Couldn't load payments");
      }
      setPayments(paymentsData.payments ?? []);
      if (rosterRes.ok) {
        const rosterData = await rosterRes.json();
        const rows: RosterRow[] = rosterData.members ?? [];
        rows.sort((a, b) =>
          `${a.lName}${a.fName}`.localeCompare(`${b.lName}${b.fName}`)
        );
        setRoster(rows);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function assign(payment: Payment) {
    const memberId = choice[payment._id];
    if (!memberId) return;
    setBusyId(payment._id);
    setError(null);
    try {
      const response = await fetch(`/api/terminal/payments/${payment._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error || "Couldn't assign that payment");
        return;
      }
      const member = roster.find((row) => row.memberId === memberId);
      setFlash(
        `${money(payment.principalCents)} assigned to ${member ? `${member.fName} ${member.lName}` : "them"}.`
      );
      await load();
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <LoadingState message="Loading unassigned payments..." />;

  const rows = payments ?? [];
  const totalCents = rows.reduce((sum, row) => sum + row.principalCents, 0);

  return (
    <PageContainer className="max-w-7xl space-y-6">
      <PageHeader
        title="Unassigned payments"
        description="Card money taken in person that nobody owns yet. Assigning it is bookkeeping: the money already moved."
        actions={
          <Button variant="outline" asChild>
            <a href="/member/admin/dues">Back to the roster</a>
          </Button>
        }
      />

      <div aria-live="polite" className="empty:hidden">
        {flash ? (
          <Alert>
            <CircleCheck aria-hidden="true" />
            <AlertDescription>{flash}</AlertDescription>
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="destructive" role="alert">
            <TriangleAlert aria-hidden="true" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </div>

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <div className="rounded-full bg-muted p-3">
                <HandCoins className="size-5 text-muted-foreground" aria-hidden="true" />
              </div>
              <p className="text-sm text-muted-foreground">
                Every payment taken in person has an owner.
              </p>
            </div>
          ) : (
            <>
              <div className="border-b border-border px-4 py-3 text-sm text-muted-foreground">
                <span className="font-medium text-foreground tabular-nums">
                  {money(totalCents)}
                </span>{" "}
                across {rows.length} payment{rows.length === 1 ? "" : "s"}.
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>What it was for</TableHead>
                    <TableHead>Taken</TableHead>
                    <TableHead>Assign to</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((payment) => {
                    const age = daysSince(payment.paidAt);
                    return (
                      <TableRow key={payment._id}>
                        <TableCell className="text-right font-medium tabular-nums">
                          {money(payment.principalCents)}
                        </TableCell>
                        <TableCell>
                          <div>{payment.description || "Not described"}</div>
                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                            {payment.payerName ? (
                              <span>{payment.payerName}</span>
                            ) : null}
                            {payment.last4 ? (
                              <span>
                                {payment.cardBrand || "card"} ending {payment.last4}
                              </span>
                            ) : null}
                            {payment.note ? <span>{payment.note}</span> : null}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span>
                              {payment.paidAt
                                ? new Date(payment.paidAt).toLocaleDateString(
                                    "en-US",
                                    { timeZone: "America/Phoenix" }
                                  )
                                : "-"}
                            </span>
                            {/* Two weeks is when unassigned money stops being a
                                pending decision and starts being a problem. */}
                            <Badge
                              variant={
                                age >= 14 ? "destructive" : age >= 7 ? "warning" : "muted"
                              }
                            >
                              {age}d
                            </Badge>
                          </div>
                          {payment.operator ? (
                            <div className="text-xs text-muted-foreground">
                              by {payment.operator.fName} {payment.operator.lName}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <select
                            aria-label={`Assign ${money(payment.principalCents)} to a member`}
                            value={choice[payment._id] ?? ""}
                            onChange={(event) =>
                              setChoice((prev) => ({
                                ...prev,
                                [payment._id]: event.target.value,
                              }))
                            }
                            className="w-full min-w-[200px] rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                          >
                            <option value="">Choose a member</option>
                            {roster.map((member) => (
                              <option key={member.memberId} value={member.memberId}>
                                {member.lName}, {member.fName} (#{member.rollNo})
                                {member.balanceCents > 0
                                  ? ` - owes ${money(member.balanceCents)}`
                                  : ""}
                              </option>
                            ))}
                          </select>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            disabled={!choice[payment._id] || busyId === payment._id}
                            onClick={() => assign(payment)}
                          >
                            Assign
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        Assigning settles the member&apos;s oldest open charges first and holds
        any remainder as credit. It can be moved again later if it turns out to
        be somebody else&apos;s.
      </p>
    </PageContainer>
  );
}
