// app/(members-only)/member/admin/profiles/ProfileCreator.tsx
"use client";

import { useMemo, useState } from "react";
import {
  Archive,
  CheckCircle2,
  CircleAlert,
  GraduationCap,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";

import MemberEditorModal, { MemberData } from "../members/MemberEditorModal";
import CreateProfileModal from "./CreateProfileModal";

import { PageContainer, PageHeader } from "../../../components/shell/PageShell";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type StatusFilter = "All" | "Active" | "Alumni" | "Removed" | "Deceased";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "All", label: "All statuses" },
  { value: "Active", label: "Active" },
  { value: "Alumni", label: "Alumni" },
  { value: "Removed", label: "Removed" },
  { value: "Deceased", label: "Deceased" },
];

export default function ProfileCreator({
  initialMembers,
}: {
  initialMembers: MemberData[];
}) {
  const [members, setMembers] = useState<MemberData[]>(initialMembers);
  const [editingRollNo, setEditingRollNo] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateWarning, setShowCreateWarning] = useState(false);
  const [deletingRollNo, setDeletingRollNo] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");

  /** Profiles with no Clerk account: the only rows this page manages. */
  const withoutAccounts = useMemo(
    () => members.filter((m) => !m.clerkId),
    [members]
  );

  const placeholderMembers = useMemo(() => {
    return withoutAccounts
      .filter((m) =>
        statusFilter === "All" ? true : (m.status || "Unknown") === statusFilter
      )
      .filter((m) => {
        if (!query.trim()) return true;
        const haystack =
          `${m.rollNo} ${m.fName} ${m.lName} ${m.status ?? ""}`.toLowerCase();
        return haystack.includes(query.trim().toLowerCase());
      });
  }, [withoutAccounts, statusFilter, query]);

  const editing = editingRollNo
    ? members.find((m) => m.rollNo === editingRollNo) || null
    : null;

  const handleCreated = (member: MemberData) => {
    setMembers((prev) => {
      const exists = prev.some((m) => m.rollNo === member.rollNo);
      return exists
        ? prev.map((m) => (m.rollNo === member.rollNo ? member : m))
        : [...prev, member];
    });
  };

  async function handleSave(updates: Partial<MemberData>) {
    if (!editing) return;
    const res = await fetch(`/api/members/${editing.rollNo}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });

    if (!res.ok) {
      const { error } = await res.json();
      throw new Error(error || "Failed to update member");
    }

    const updated = (await res.json()) as MemberData;
    setMembers((ms) =>
      ms.map((m) => (m.rollNo === editing.rollNo ? { ...m, ...updated } : m))
    );
  }

  async function confirmDelete() {
    if (!deletingRollNo) return;
    setDeleteLoading(true);
    setDeleteError("");
    const res = await fetch(`/api/members/${deletingRollNo}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setMembers((ms) => ms.filter((m) => m.rollNo !== deletingRollNo));
      setDeletingRollNo(null);
    } else {
      const { error } = await res.json().catch(() => ({ error: "" }));
      // Was a browser alert(), which vanished and left no trace of the failure.
      setDeleteError(error || "Failed to delete profile.");
    }
    setDeleteLoading(false);
  }

  const isFiltered = statusFilter !== "All" || query.trim() !== "";

  return (
    <PageContainer className="max-w-7xl space-y-6">
      <PageHeader
        title="Create profiles"
        description="Filler profiles for brothers who do not have an account yet."
        actions={
          <Button type="button" onClick={() => setShowCreateWarning(true)}>
            <Plus aria-hidden="true" />
            Create profile
          </Button>
        }
      />

      {deleteError ? (
        <Alert variant="destructive" role="alert">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Profile delete failed</AlertTitle>
          <AlertDescription>{deleteError}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader className="gap-4 border-b xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-1.5">
            <CardTitle>Profiles without accounts</CardTitle>
            <CardDescription>
              Showing {placeholderMembers.length} of {withoutAccounts.length}{" "}
              profiles.
            </CardDescription>
          </div>

          <div className="grid w-full min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_11rem] xl:w-[32rem]">
            {/* Flex field rather than an icon absolutely positioned over a
              * padded input: `cn()` keeps both the Input base's `px-3` and any
              * `pl-*` override, so clearance would depend on CSS source order. */}
            <div className="flex h-10 min-w-0 items-center gap-2 rounded-md border border-input bg-background px-3 ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
              <Search
                aria-hidden="true"
                className="h-4 w-4 shrink-0 text-muted-foreground"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search profiles…"
                aria-label="Search profiles"
                className="m-0 h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:appearance-none"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear profile search"
                  className="-mr-1 flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>

            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as StatusFilter)}
            >
              <SelectTrigger aria-label="Filter profiles by status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28 pl-6">Roll</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-14 pr-6">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {placeholderMembers.length ? (
                placeholderMembers.map((member) => (
                  <TableRow key={member._id || member.rollNo}>
                    <TableCell className="pl-6 font-mono text-sm">
                      #{member.rollNo}
                    </TableCell>
                    <TableCell>
                      <p className="truncate font-medium">
                        {member.fName} {member.lName}
                      </p>
                      {member.isHidden ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Directory hidden
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={member.status || "Unknown"} />
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Actions for ${member.fName} ${member.lName}`}
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuLabel>Profile actions</DropdownMenuLabel>
                          <DropdownMenuItem
                            onSelect={() => setEditingRollNo(member.rollNo)}
                          >
                            <Pencil className="size-4" />
                            Edit profile
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={() => {
                              setDeleteError("");
                              setDeletingRollNo(member.rollNo);
                            }}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="size-4" />
                            Delete profile
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="h-56 text-center">
                    <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
                      <div className="rounded-full bg-muted p-3">
                        <Search className="size-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium">
                          {isFiltered
                            ? "No profiles found"
                            : "No placeholder profiles yet"}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {isFiltered
                            ? "Try a different search or status filter."
                            : "Profiles you create for brothers without an account appear here."}
                        </p>
                      </div>
                      {isFiltered ? (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setQuery("");
                            setStatusFilter("All");
                          }}
                        >
                          Clear filters
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {editing && (
        <MemberEditorModal
          member={editing}
          show={true}
          onClose={() => setEditingRollNo(null)}
          onSave={handleSave}
        />
      )}

      {showCreateModal && (
        <CreateProfileModal
          show={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreated={handleCreated}
        />
      )}

      {/* Gate before creating: these profiles cannot be logged into. */}
      <AlertDialog
        open={showCreateWarning}
        onOpenChange={setShowCreateWarning}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Filler profile notice</AlertDialogTitle>
            <AlertDialogDescription>
              These are filler profiles only and cannot be accessed by the
              member. If you want them to log in, invite them from the Invite
              Member tab.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-center">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowCreateWarning(false);
                setShowCreateModal(true);
              }}
            >
              I understand
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deletingRollNo !== null}
        onOpenChange={(open) => {
          if (!open && !deleteLoading) {
            setDeletingRollNo(null);
            setDeleteError("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this profile?</AlertDialogTitle>
            <AlertDialogDescription>
              Profile #{deletingRollNo} will be permanently deleted. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError ? (
            <Alert variant="destructive" role="alert">
              <CircleAlert aria-hidden="true" />
              <AlertDescription>{deleteError}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter className="sm:justify-center">
            <AlertDialogCancel disabled={deleteLoading}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                // Keep the dialog open so a failure stays visible.
                event.preventDefault();
                confirmDelete();
              }}
              disabled={deleteLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteLoading ? "Deleting…" : "Delete profile"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}

/** Mirrors the roster's status badge. Worth extracting to a shared component
 *  once `admin/members/MembersList.tsx` is not being edited concurrently. */
function StatusBadge({ status }: { status: string }) {
  if (status === "Active") {
    return (
      <Badge variant="success">
        <CheckCircle2 className="size-3" />
        Active
      </Badge>
    );
  }

  if (status === "Alumni") {
    return (
      <Badge variant="secondary">
        <GraduationCap className="size-3" />
        Alumni
      </Badge>
    );
  }

  return (
    <Badge variant={status === "Removed" ? "destructive" : "muted"}>
      <Archive className="size-3" />
      {status}
    </Badge>
  );
}
