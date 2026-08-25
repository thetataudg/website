"use client";

import FinanceTimeline from "../../dues/FinanceTimeline";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/// One member's whole financial story, from the roster.
///
/// Deliberately the same component the member sees of their own record. A
/// fuller officer-only version would be a record the member can't check, and a
/// record they can't check is one they can't dispute.
export default function MemberHistoryModal({
  rollNo,
  name,
  onClose,
}: {
  rollNo: string;
  name: string;
  onClose: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="grid max-h-[85dvh] w-[calc(100%-2rem)] max-w-2xl grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-5 pr-12 text-left">
          <DialogTitle>{name}</DialogTitle>
          <DialogDescription>#{rollNo}</DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto px-6 py-5">
          <FinanceTimeline
            endpoint={`/api/dues/history/${encodeURIComponent(rollNo)}`}
            title="Finance history"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
