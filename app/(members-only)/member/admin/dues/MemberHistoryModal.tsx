"use client";

import FinanceTimeline from "../../dues/FinanceTimeline";
import MemberChargesPanel from "./MemberChargesPanel";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/// One member's whole financial story, from the roster.
///
/// Deliberately the same component the member sees of their own record. A
/// fuller officer-only version would be a record the member can't check, and a
/// record they can't check is one they can't dispute.
export default function MemberHistorySheet({
  rollNo,
  name,
  onClose,
  onChanged,
}: {
  rollNo: string;
  name: string;
  onClose: () => void;
  /// Lets the roster behind this refresh when a charge is taken back.
  onChanged?: () => void;
}) {
  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="grid w-full grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-2xl"
      >
        <SheetHeader className="border-b border-border px-6 py-5 pr-12">
          <SheetTitle>{name}</SheetTitle>
          <SheetDescription>
            #{rollNo} · Every charge, payment, claim and reminder on this
            member&apos;s record.
          </SheetDescription>
        </SheetHeader>
        <div className="overflow-y-auto px-6 py-5">
          <MemberChargesPanel rollNo={rollNo} onChanged={onChanged} />
          <FinanceTimeline
            endpoint={`/api/dues/history/${encodeURIComponent(rollNo)}`}
            bare
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
