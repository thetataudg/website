"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronsUpDown,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Users,
  X,
} from "lucide-react";

import LoadingState, { LoadingSpinner } from "../../../components/LoadingState";
import QuickToolsModal from "../members/QuickToolsModal";
import { PageContainer, PageHeader } from "../../../components/shell/PageShell";
import { cn } from "@/lib/utils";
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type Member = {
  _id: string;
  fName: string;
  lName: string;
  rollNo: string;
  status?: string;
};

type Committee = {
  _id: string;
  name: string;
  description?: string;
  committeeHeadId?: string | { _id?: string; fName?: string; lName?: string };
  committeeMembers?: (string | { _id?: string; fName?: string; lName?: string })[];
};

export default function CommitteesPage() {
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  // Purge lives here rather than on Manage Members: it empties committees, so
  // it belongs beside the committees it empties.
  const [showPurge, setShowPurge] = useState(false);
  const [canPurge, setCanPurge] = useState(false);

  const [form, setForm] = useState({
    name: "",
    description: "",
    committeeHeadId: "",
    committeeMembers: [] as string[],
  });

  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    committeeHeadId: "",
    committeeMembers: [] as string[],
  });

  const activeMembers = useMemo(
    () => members.filter((m) => m.status === "Active"),
    [members]
  );

  useEffect(() => {
    async function load() {
      const [commRes, memRes] = await Promise.all([
        fetch("/api/committees"),
        fetch("/api/members"),
      ]);
      const commData = commRes.ok ? await commRes.json() : [];
      const memData = memRes.ok ? await memRes.json() : [];
      setCommittees(commData);
      setMembers(memData);
      setLoading(false);
    }
    load();
  }, []);

  // Who may run the purge, matched to `/api/members/quick-tools`: any admin, or
  // a sitting Regent/Vice Regent. Narrower than who may edit a committee, which
  // is all of E-Council.
  useEffect(() => {
    fetch("/api/members/me")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((me) =>
        setCanPurge(
          me?.role === "superadmin" ||
            me?.role === "admin" ||
            (Boolean(me?.isECouncil) &&
              (me?.ecouncilPosition === "Regent" ||
                me?.ecouncilPosition === "Vice Regent"))
        )
      )
      .catch(() => setCanPurge(false));
  }, []);

  function resetForm() {
    setForm({
      name: "",
      description: "",
      committeeHeadId: "",
      committeeMembers: [],
    });
  }

  function startEdit(committee: Committee) {
    const headId =
      typeof committee.committeeHeadId === "string"
        ? committee.committeeHeadId
        : committee.committeeHeadId?._id || "";
    const memberIds =
      committee.committeeMembers?.map((m: any) => {
        if (typeof m === "string") return m;
        if (m && typeof m === "object") {
          if (m._id) return m._id;
          if (typeof m.toString === "function") return m.toString();
        }
        return "";
      }) || [];
    setEditForm({
      name: committee.name,
      description: committee.description || "",
      committeeHeadId: headId,
      committeeMembers: memberIds.filter(Boolean),
    });
    setEditingId(committee._id);
    setShowEdit(true);
  }

  async function saveCommittee(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      committeeHeadId: form.committeeHeadId || null,
      committeeMembers: form.committeeMembers.filter(
        (id) => id !== form.committeeHeadId
      ),
    };

    const res = await fetch("/api/committees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const created = await res.json();
      setCommittees((prev) => [created, ...prev]);
      resetForm();
      setShowCreate(false);
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    const payload = {
      name: editForm.name.trim(),
      description: editForm.description.trim(),
      committeeHeadId: editForm.committeeHeadId || null,
      committeeMembers: editForm.committeeMembers.filter(
        (id) => id !== editForm.committeeHeadId
      ),
    };
    const res = await fetch(`/api/committees/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const updated = await res.json();
      setCommittees((prev) =>
        prev.map((c) => (c._id === editingId ? updated : c))
      );
      setEditingId(null);
      setShowEdit(false);
      setEditForm({
        name: "",
        description: "",
        committeeHeadId: "",
        committeeMembers: [],
      });
    }
  }

  async function confirmDelete() {
    if (!deleteId) return;
    const res = await fetch(`/api/committees/${deleteId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setCommittees((prev) => prev.filter((c) => c._id !== deleteId));
      setDeleteId(null);
      if (editingId === deleteId) {
        setEditingId(null);
        setShowEdit(false);
        setEditForm({
          name: "",
          description: "",
          committeeHeadId: "",
          committeeMembers: [],
        });
      }
    }
  }

  if (loading) {
    return <LoadingState message="Loading committees..." />;
  }

  const closeEdit = () => {
    setShowEdit(false);
    setEditingId(null);
    setEditForm({
      name: "",
      description: "",
      committeeHeadId: "",
      committeeMembers: [],
    });
  };

  return (
    <PageContainer className="max-w-7xl space-y-6">
      <PageHeader
        title="Manage committees"
        description="Create committees, assign heads, and manage rosters."
        actions={
          <>
            {canPurge && (
              <Button
                variant="outline"
                onClick={() => setShowPurge(true)}
                className="text-destructive hover:text-destructive"
              >
                Purge committees
              </Button>
            )}
            <Button onClick={() => setShowCreate(true)}>
              <Plus aria-hidden="true" />
              Add committee
            </Button>
          </>
        }
      />

      <QuickToolsModal
        show={showPurge}
        initialTool="purgeCommittees"
        canSubmitQuickTools={canPurge}
        onClose={() => setShowPurge(false)}
        onCompleted={async () => {
          // The purge clears every head and every roster, so the table behind
          // it is stale the moment it lands.
          const res = await fetch("/api/committees");
          if (res.ok) setCommittees(await res.json());
        }}
      />

      <Card className="overflow-hidden">
        <CardHeader className="border-b">
          <CardTitle>Chapter committees</CardTitle>
          <CardDescription>
            {committees.length} committee{committees.length === 1 ? "" : "s"}.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Name</TableHead>
                <TableHead>Head</TableHead>
                <TableHead className="w-28">Members</TableHead>
                <TableHead className="w-14 pr-6">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {committees.length ? (
                committees.map((c) => {
                  const headName =
                    typeof c.committeeHeadId === "string"
                      ? activeMembers.find((m) => m._id === c.committeeHeadId)
                      : c.committeeHeadId;
                  const headLabel =
                    headName && typeof headName !== "string"
                      ? `${headName.fName || ""} ${headName.lName || ""}`.trim()
                      : "";

                  return (
                    <TableRow key={c._id}>
                      <TableCell className="pl-6">
                        <p className="font-medium">{c.name}</p>
                        {c.description ? (
                          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                            {c.description}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {headLabel ? (
                          headLabel
                        ) : (
                          <span className="text-muted-foreground">
                            Unassigned
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="muted">
                          {c.committeeMembers?.length || 0}
                        </Badge>
                      </TableCell>
                      <TableCell className="pr-6 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Actions for ${c.name}`}
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuLabel>
                              Committee actions
                            </DropdownMenuLabel>
                            <DropdownMenuItem onSelect={() => startEdit(c)}>
                              <Pencil className="size-4" />
                              Edit committee
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onSelect={() => setDeleteId(c._id)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="size-4" />
                              Delete committee
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="h-56 text-center">
                    <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
                      <div className="rounded-full bg-muted p-3">
                        <Users className="size-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium">No committees yet</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Add a committee to start assigning heads and members.
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => setShowCreate(true)}
                      >
                        <Plus aria-hidden="true" />
                        Add committee
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create and edit share one form: the payloads differ, the fields do not. */}
      <CommitteeFormDialog
        open={showCreate}
        onOpenChange={(next) => {
          if (!next) {
            resetForm();
            setShowCreate(false);
          }
        }}
        title="Create committee"
        description="Name the committee, pick a head, and add members."
        submitLabel="Create committee"
        saving={loading}
        members={activeMembers}
        form={form}
        setForm={setForm}
        onSubmit={saveCommittee}
      />

      <CommitteeFormDialog
        open={showEdit}
        onOpenChange={(next) => {
          if (!next) closeEdit();
        }}
        title="Edit committee"
        description="Update the committee name, head, and roster."
        submitLabel="Save changes"
        saving={loading}
        members={activeMembers}
        form={editForm}
        setForm={setEditForm}
        onSubmit={saveEdit}
      />

      <AlertDialog
        open={deleteId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this committee?</AlertDialogTitle>
            <AlertDialogDescription>
              The committee and its roster assignments will be removed. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-center">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete committee
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}

type CommitteeForm = {
  name: string;
  description: string;
  committeeHeadId: string;
  committeeMembers: string[];
};

/** Shared create/edit form. */
function CommitteeFormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  saving,
  members,
  form,
  setForm,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  submitLabel: string;
  saving: boolean;
  members: Member[];
  form: CommitteeForm;
  setForm: React.Dispatch<React.SetStateAction<CommitteeForm>>;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[calc(100%-2rem)] max-w-2xl"
        /* No backdrop dismissal: a stray click would discard the form. */
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="committee-name">Committee name</Label>
              <Input
                id="committee-name"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="committee-head">Committee head</Label>
              <SingleMemberPicker
                id="committee-head"
                members={members}
                value={form.committeeHeadId}
                onChange={(id) =>
                  setForm((f) => ({
                    ...f,
                    committeeHeadId: id,
                    committeeMembers: f.committeeMembers.filter(
                      (memberId) => memberId !== id
                    ),
                  }))
                }
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="committee-description">Description</Label>
            <Textarea
              id="committee-description"
              rows={2}
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="committee-members">Committee members</Label>
            <MemberPicker
              id="committee-members"
              members={members}
              value={form.committeeMembers}
              onChange={(ids) =>
                setForm((f) => ({
                  ...f,
                  committeeMembers: ids.filter(
                    (id) => id !== f.committeeHeadId
                  ),
                }))
              }
              disabledIds={form.committeeHeadId ? [form.committeeHeadId] : []}
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <LoadingSpinner size="sm" />}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const memberLabel = (m: Member) => `${m.fName} ${m.lName}`;
/** Roll number in the search value so "#412" matches, and so members who share
 *  a name stay distinguishable. */
const memberSearchValue = (m: Member) =>
  `${m.fName} ${m.lName} ${m.rollNo}`;

/** Single-select member combobox (committee head). */
function SingleMemberPicker({
  id,
  members,
  value,
  onChange,
}: {
  id: string;
  members: Member[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = members.find((m) => m._id === value) || null;

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? memberLabel(selected) : "Unassigned"}
          </span>
          <ChevronsUpDown aria-hidden="true" className="shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] p-0"
      >
        <Command>
          <CommandInput placeholder="Search by name or roll number…" />
          <CommandList>
            <CommandEmpty>No members found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="Unassigned"
                onSelect={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                <Check
                  aria-hidden="true"
                  className={cn(!selected ? "opacity-100" : "opacity-0")}
                />
                Unassigned
              </CommandItem>
              {members.map((m) => (
                <CommandItem
                  key={m._id}
                  value={memberSearchValue(m)}
                  onSelect={() => {
                    onChange(m._id);
                    setOpen(false);
                  }}
                >
                  <Check
                    aria-hidden="true"
                    className={cn(
                      value === m._id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="truncate">{memberLabel(m)}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    #{m.rollNo}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Multi-select member combobox (committee roster). */
function MemberPicker({
  id,
  members,
  value,
  onChange,
  disabledIds = [],
}: {
  id: string;
  members: Member[];
  value: string[];
  onChange: (ids: string[]) => void;
  disabledIds?: string[];
}) {
  const [open, setOpen] = useState(false);
  const selected = value
    .map((memberId) => members.find((m) => m._id === memberId))
    .filter((m): m is Member => Boolean(m));

  const toggle = (memberId: string) => {
    if (disabledIds.includes(memberId)) return;
    onChange(
      value.includes(memberId)
        ? value.filter((existing) => existing !== memberId)
        : [...value, memberId]
    );
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen} modal>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            <span
              className={cn(
                "truncate",
                selected.length === 0 && "text-muted-foreground"
              )}
            >
              {selected.length
                ? `${selected.length} member${
                    selected.length === 1 ? "" : "s"
                  } selected`
                : "Select members"}
            </span>
            <ChevronsUpDown aria-hidden="true" className="shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] p-0"
        >
          <Command>
            <CommandInput placeholder="Search by name or roll number…" />
            <CommandList>
              <CommandEmpty>No members found.</CommandEmpty>
              <CommandGroup>
                {members.map((m) => {
                  const isDisabled = disabledIds.includes(m._id);
                  return (
                    <CommandItem
                      key={m._id}
                      value={memberSearchValue(m)}
                      disabled={isDisabled}
                      onSelect={() => toggle(m._id)}
                    >
                      <Check
                        aria-hidden="true"
                        className={cn(
                          value.includes(m._id) ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <span className="truncate">{memberLabel(m)}</span>
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                        {isDisabled ? "Head" : `#${m.rollNo}`}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selected.length > 0 && (
        <ul className="flex list-none flex-wrap gap-1.5 p-0">
          {selected.map((m) => (
            <li key={m._id}>
              <Badge variant="muted" className="gap-1 pr-1">
                {memberLabel(m)}
                <button
                  type="button"
                  onClick={() => toggle(m._id)}
                  aria-label={`Remove ${memberLabel(m)}`}
                  className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
