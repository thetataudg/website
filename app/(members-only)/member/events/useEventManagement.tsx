"use client";

import * as React from "react";
import { CircleAlert, Loader2, Trash2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { fetchEventDetail, patchEventStatus } from "./eventActions";
import { EventFormDialog } from "./EventFormDialog";
import { EventRollDialog, useRollMembers } from "./EventRollDialog";
import { useEventViewer, type EventViewer } from "./useEventsData";

/**
 * Making, editing, deleting and taking the roll for events, from any screen.
 *
 * The events page, both full lists, a single event's page, the committee
 * dashboard and Manage events each grew their own copy of this, or went
 * without. It is a hook that hands back the dialogs as an element, so a screen
 * mounts `dialogs` once and calls `openCreate` / `openEdit` / `openRoll` from
 * wherever its buttons are. Who is allowed is never decided here: `canCreate`
 * comes from the viewer's committees (the same rule the phone's "+" uses) and
 * the per-event `canManage` / `canDelete` come from the server on the event
 * itself.
 *
 * `onChanged` runs after anything that changes the event list or the event on
 * screen, so each screen reloads whatever it is showing.
 */
export function useEventManagement({
  viewer: suppliedViewer,
  onChanged,
  onDeleted,
  fixedCommitteeId,
}: {
  /** Pass the viewer a screen already loaded; omitted, the hook loads its own. */
  viewer?: EventViewer;
  onChanged?: () => Promise<void> | void;
  /** After a delete, so a page that was showing the event can leave it. */
  onDeleted?: (eventId: string) => void;
  /** Pins new events to one committee, as on that committee's dashboard. */
  fixedCommitteeId?: string | null;
} = {}) {
  const ownViewer = useEventViewer(!suppliedViewer);
  const viewer = suppliedViewer ?? ownViewer;

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<any | null>(null);
  const [roll, setRoll] = React.useState<any | null>(null);
  const [wantMembers, setWantMembers] = React.useState(false);
  const members = useRollMembers(wantMembers);

  const [deleting, setDeleting] = React.useState<{ _id: string; name: string } | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);

  const changed = React.useCallback(async () => {
    await onChanged?.();
  }, [onChanged]);

  const openCreate = React.useCallback(() => {
    setEditing(null);
    setFormOpen(true);
  }, []);

  const openEdit = React.useCallback(async (eventId: string) => {
    const detail = await fetchEventDetail(eventId);
    if (!detail) return;
    setEditing(detail);
    setFormOpen(true);
  }, []);

  const refreshRoll = React.useCallback(async (eventId: string) => {
    const detail = await fetchEventDetail(eventId);
    if (detail) setRoll(detail);
  }, []);

  const openRoll = React.useCallback(
    async (eventId: string) => {
      // The member list is the heaviest request on these screens, so it waits
      // until somebody actually opens a roll.
      setWantMembers(true);
      await refreshRoll(eventId);
    },
    [refreshRoll]
  );

  /** Completed back to ongoing: somebody was missed and the door has to open again. */
  const reopen = React.useCallback(
    async (eventId: string) => {
      if (await patchEventStatus(eventId, "ongoing")) {
        await refreshRoll(eventId);
        await changed();
      }
    },
    [refreshRoll, changed]
  );

  const requestDelete = React.useCallback((event: { _id: string; name: string }) => {
    setDeleteError(null);
    setDeleting({ _id: event._id, name: event.name });
  }, []);

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/events/${deleting._id}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "The event could not be deleted.");
      }
      const deletedId = deleting._id;
      setDeleting(null);
      setRoll(null);
      await changed();
      onDeleted?.(deletedId);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "The event could not be deleted.");
    } finally {
      setDeleteBusy(false);
    }
  }

  const rollCommittee = React.useMemo(
    () =>
      roll?.committeeId
        ? viewer.committees.find((committee) => committee._id === roll.committeeId) ?? null
        : null,
    [roll?.committeeId, viewer.committees]
  );

  // Only an officer can make a chapter-wide event or move one between
  // committees, so everyone else gets a form with those controls taken away
  // rather than one that fails on submit.
  const formCommittees = fixedCommitteeId
    ? viewer.committees.filter((committee) => committee._id === fixedCommitteeId)
    : viewer.schedulableCommittees;

  const dialogs = (
    <>
      <EventFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        event={editing}
        committees={formCommittees}
        fixedCommitteeId={editing ? null : fixedCommitteeId}
        allowChapterWide={viewer.isOfficer && !fixedCommitteeId}
        canChangeCommittee={viewer.isAdmin}
        onDelete={(event) => {
          setFormOpen(false);
          setEditing(null);
          requestDelete(event);
        }}
        onSaved={async () => {
          await changed();
        }}
      />

      <EventRollDialog
        event={roll}
        members={members}
        committee={rollCommittee}
        onClose={() => setRoll(null)}
        onRefresh={refreshRoll}
        onEdit={(eventId) => {
          setRoll(null);
          void openEdit(eventId);
        }}
        onReopen={reopen}
      />

      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null);
            setDeleteError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this event?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.name} will be removed, along with any attendance recorded
              against it. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {deleteError ? (
            <Alert variant="destructive">
              <CircleAlert className="size-4" />
              <AlertDescription>{deleteError}</AlertDescription>
            </Alert>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteBusy}
              onClick={() => void confirmDelete()}
            >
              {deleteBusy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Delete event
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  return {
    canCreate: viewer.canCreate,
    openCreate,
    openEdit,
    openRoll,
    requestDelete,
    reopen,
    dialogs,
  };
}
