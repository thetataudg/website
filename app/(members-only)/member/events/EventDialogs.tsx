"use client";

import * as React from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { formatDateTime } from "./types";

/**
 * Who turned up, once an event is closed out.
 *
 * Shared by the overview and the full lists: ending an event and looking at
 * the attendance that follows is one action in two places.
 */
export function AttendanceDialog({
  event,
  onClose,
}: {
  event: any;
  onClose: () => void;
}) {
  const attendees = event?.attendees ?? [];

  return (
    <Dialog open={!!event} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{event?.name ?? "Event summary"}</DialogTitle>
          <DialogDescription>
            {attendees.length === 1
              ? "1 member checked in"
              : `${attendees.length} members checked in`}
          </DialogDescription>
        </DialogHeader>

        {attendees.length ? (
          <div className="divide-y rounded-lg border">
            {attendees.map((entry: any) => (
              <div
                key={entry.memberId?._id || entry.checkedInAt}
                className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
              >
                <span className="min-w-0 truncate">
                  {entry.memberId?.fName} {entry.memberId?.lName}
                  <span className="ml-1.5 font-mono text-xs text-muted-foreground">
                    #{entry.memberId?.rollNo}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {entry.checkedInAt ? formatDateTime(entry.checkedInAt) : ""}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No check-ins recorded.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
