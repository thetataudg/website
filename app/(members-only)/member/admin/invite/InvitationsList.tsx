// app/(members-only)/member/admin/invite/InvitationsList.tsx
"use client";

import { useState } from "react";
import {
  CircleCheck,
  Clock,
  MailCheck,
  MailQuestion,
  MailWarning,
  MailX,
  Trash2,
} from "lucide-react";
import type { Invitation } from "@clerk/clerk-sdk-node";

import {
  AlertDialog,
  AlertDialogAction,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type EmailDelivery = {
  /// Clerk's word for the email, e.g. "queued", "delivered", "failed".
  status: string | null;
  occurredAt: string | null;
  deliveredByClerk: boolean | null;
  provider: "clerk" | "resend" | null;
};

interface Props {
  invites: (Invitation & { status?: string; emailDelivery?: EmailDelivery | null })[];
  onRevoke: (id: string) => void;
}

/// The creation webhook confirms that Clerk or Resend accepted the message.
/// It does not confirm inbox delivery, so the badge says "Sent" unless the
/// provider reports a later delivery state.
function EmailStatusBadge({ delivery }: { delivery?: EmailDelivery | null }) {
  if (!delivery) {
    return (
      <Badge variant="muted" title="No email.created webhook has been received for this address">
        <MailQuestion className="size-3" />
        No record
      </Badge>
    );
  }

  const status = (delivery.status ?? "").toLowerCase();
  const when = delivery.occurredAt
    ? new Date(delivery.occurredAt).toLocaleString()
    : undefined;

  if (status === "failed" || status === "bounced" || status === "undelivered") {
    return (
      <Badge variant="destructive" title={when}>
        <MailWarning className="size-3" />
        {status === "failed" ? "Failed" : "Bounced"}
      </Badge>
    );
  }

  if (status === "delivered") {
    return (
      <Badge variant="success" title={when}>
        <MailCheck className="size-3" />
        Delivered
      </Badge>
    );
  }

  return (
    <Badge
      variant="muted"
      title={when ? `Sent via ${delivery.provider === "resend" ? "Resend" : "Clerk"} at ${when}` : undefined}
    >
      <MailCheck className="size-3" />
      Sent
    </Badge>
  );
}

export default function InvitationsList({ invites, onRevoke }: Props) {
  const [revoking, setRevoking] = useState<
    { id: string; email: string } | null
  >(null);

  if (invites.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <div className="rounded-full bg-muted p-3">
          <MailX className="size-5 text-muted-foreground" aria-hidden="true" />
        </div>
        <div>
          <p className="font-medium">No pending invitations</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Invitations you send appear here until they are accepted.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-6">Email</TableHead>
            <TableHead className="w-32">Status</TableHead>
            <TableHead className="w-36">Email status</TableHead>
            <TableHead className="w-32 pr-6">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invites.map((inv) => {
            const accepted = inv.status === "accepted";
            return (
              <TableRow key={inv.id}>
                <TableCell className="pl-6 font-medium">
                  {inv.emailAddress}
                </TableCell>
                <TableCell>
                  {accepted ? (
                    <Badge variant="success">
                      <CircleCheck className="size-3" />
                      Accepted
                    </Badge>
                  ) : (
                    <Badge variant="muted">
                      <Clock className="size-3" />
                      Pending
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <EmailStatusBadge delivery={inv.emailDelivery} />
                </TableCell>
                <TableCell className="pr-6 text-right">
                  {!accepted && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() =>
                        setRevoking({ id: inv.id, email: inv.emailAddress })
                      }
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                      Revoke
                      <span className="sr-only">{` invitation for ${inv.emailAddress}`}</span>
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Revoking used to fire on a single click with no confirmation. */}
      <AlertDialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) setRevoking(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this invitation?</AlertDialogTitle>
            <AlertDialogDescription>
              {revoking?.email} will no longer be able to use the invitation
              link. You can send a new invitation afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-center">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (revoking) onRevoke(revoking.id);
                setRevoking(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Revoke invitation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
