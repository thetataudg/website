"use client";

import { Paperclip } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { money, requestStatus, shortDate, type BudgetRequest } from "./api";

export function RequestRow({ request, showCommittee = false, actions }: { request: BudgetRequest; showCommittee?: boolean; actions?: React.ReactNode }) {
  const status = requestStatus(request);
  const partial = request.approvedCents !== null && request.approvedCents < request.amountCents;
  return (
    <div className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-foreground">{request.description}</p>
          <Badge variant={status.variant}>{status.label}</Badge>
          {request.kind === "preapproval" ? <Badge variant="outline">Pre-approval</Badge> : null}
          {request.overBudgetOverride ? <Badge variant="destructive">Over budget</Badge> : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {partial ? (
            <>
              {money(request.approvedCents)} of {money(request.amountCents)}
            </>
          ) : (
            money(request.approvedCents ?? request.amountCents)
          )}
          {" · "}
          {showCommittee ? `${request.committeeName} / ` : ""}
          {request.lineName}
          {request.submittedBy ? ` · ${request.submittedBy.name}` : ""}
          {request.submittedAt ? ` · ${shortDate(request.submittedAt)}` : ""}
          {request.payout.status === "paid" && request.payout.method ? ` · paid by ${request.payout.method === "credit" ? "dues credit" : request.payout.method}` : ""}
        </p>
        {request.reviewNote ? <p className="text-sm text-muted-foreground">Treasurer: {request.reviewNote}</p> : null}
        {request.receiptUrls.length ? (
          <p className="flex flex-wrap gap-3 text-sm">
            {request.receiptUrls.map((url, i) => (
              <a key={url} href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                <Paperclip className="size-3.5" aria-hidden="true" /> Receipt {i + 1}
              </a>
            ))}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
