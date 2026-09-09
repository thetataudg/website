"use client";

// The head's edit / delete controls for a poll. Used on the grid header, the
// results header, and each row of the committee dashboard's poll list.
import * as React from "react";
import { Loader2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DateTime } from "luxon";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { pollApi, type PollDetail, type PollSummary } from "./pollClient";

type PollLike = (PollSummary | PollDetail) & {
  reminder?: PollDetail["reminder"];
};

export function PollManagerMenu({
  poll,
  onChanged,
  onDeleted,
  size = "sm",
}: {
  poll: PollLike;
  /// Called after a successful edit (and after a cancel, if `onDeleted` is not
  /// given).
  onChanged?: () => void;
  /// Called after the poll is cancelled — e.g. to navigate away from its page.
  onDeleted?: () => void;
  size?: "sm" | "icon";
}) {
  const [editOpen, setEditOpen] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const scheduled = poll.status === "scheduled";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size={size === "icon" ? "icon" : "sm"}>
            <MoreHorizontal className="size-4" />
            {size !== "icon" && <span className="sr-only">Poll actions</span>}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => setEditOpen(true)}
            disabled={scheduled}
          >
            <Pencil className="size-4" /> Edit poll
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => setConfirmOpen(true)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="size-4" /> Delete poll
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EditDialog
        poll={poll}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={() => {
          setEditOpen(false);
          onChanged?.();
        }}
      />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this poll?</AlertDialogTitle>
            <AlertDialogDescription>
              {poll.title} and everyone&apos;s answers are deleted for good. This
              can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                try {
                  await pollApi.remove(poll._id);
                  toast.success("Poll deleted");
                  (onDeleted ?? onChanged)?.();
                } catch (e: any) {
                  toast.error(e.message);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function EditDialog({
  poll,
  open,
  onOpenChange,
  onSaved,
}: {
  poll: PollLike;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const r = poll.reminder;
  const [title, setTitle] = React.useState(poll.title);
  const [description, setDescription] = React.useState(poll.description ?? "");
  const [deadline, setDeadline] = React.useState("");
  const [cadenceHours, setCadenceHours] = React.useState(
    String(r?.cadenceHours ?? 24)
  );
  const [maxReminders, setMaxReminders] = React.useState(
    String(r?.maxReminders ?? 5)
  );
  const [finalCallHours, setFinalCallHours] = React.useState(
    String(r?.finalCallHours ?? 24)
  );
  const [escalateToHead, setEscalateToHead] = React.useState(
    r?.escalateToHead ?? true
  );
  const [saving, setSaving] = React.useState(false);

  // Reset from the poll each time it opens.
  React.useEffect(() => {
    if (!open) return;
    setTitle(poll.title);
    setDescription(poll.description ?? "");
    setDeadline(
      poll.deadline
        ? DateTime.fromISO(poll.deadline).toFormat("yyyy-MM-dd'T'HH:mm")
        : ""
    );
    setCadenceHours(String(poll.reminder?.cadenceHours ?? 24));
    setMaxReminders(String(poll.reminder?.maxReminders ?? 5));
    setFinalCallHours(String(poll.reminder?.finalCallHours ?? 24));
    setEscalateToHead(poll.reminder?.escalateToHead ?? true);
  }, [open, poll]);

  const save = async () => {
    if (!title.trim()) return toast.error("Give the poll a title.");
    setSaving(true);
    try {
      await pollApi.patch(poll._id, {
        title: title.trim(),
        description: description.trim(),
        ...(deadline ? { deadline: new Date(deadline).toISOString() } : {}),
        reminder: {
          cadenceHours: Number(cadenceHours),
          maxReminders: Number(maxReminders),
          finalCallHours: Number(finalCallHours),
          escalateToHead,
        },
      });
      toast.success("Poll updated");
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit poll</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-title">Title</Label>
            <Input
              id="edit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-desc">Description</Label>
            <Textarea
              id="edit-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-deadline">Poll closes</Label>
            <DateTimePicker
              id="edit-deadline"
              value={deadline}
              onChange={setDeadline}
            />
            <p className="text-xs text-muted-foreground">
              The days, times and roster are fixed once the poll opens. Start a
              new poll to change those.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-cad">Remind every (h)</Label>
              <Input
                id="edit-cad"
                type="number"
                min={1}
                value={cadenceHours}
                onChange={(e) => setCadenceHours(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-max">Max reminders</Label>
              <Input
                id="edit-max"
                type="number"
                min={1}
                value={maxReminders}
                onChange={(e) => setMaxReminders(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-fc">Final call within (h)</Label>
              <Input
                id="edit-fc"
                type="number"
                min={1}
                value={finalCallHours}
                onChange={(e) => setFinalCallHours(e.target.value)}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={escalateToHead}
              onCheckedChange={(v) => setEscalateToHead(!!v)}
            />
            Send me a digest of who is still outstanding
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
