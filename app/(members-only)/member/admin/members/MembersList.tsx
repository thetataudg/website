"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import {
  Archive,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  GraduationCap,
  KeyRound,
  Loader2,
  MoreHorizontal,
  Pencil,
  Search,
  ShieldCheck,
  Trash2,
  UserCog,
  Users,
  Vote,
  X,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LoadingState from "../../../components/LoadingState";
import { PageContainer, PageHeader } from "../../../components/shell/PageShell";
import MemberEditorModal from "./MemberEditorModal";
import QuickToolsModal from "./QuickToolsModal";

export interface MemberData {
  _id: string;
  rollNo: string;
  fName: string;
  lName: string;
  clerkId?: string;
  role: "superadmin" | "admin" | "member";
  status?: "Active" | "Alumni" | "Removed" | "Deceased";
  isECouncil: boolean;
  ecouncilPosition: string;
  isCommitteeHead: boolean;
  familyLine: string;
  bigs: string[];
  littles: string[];
  majors: string[];
  minors?: string[];
  gradYear: number;
  bio?: string;
  headline?: string;
  pronouns?: string;
  skills?: string[];
  funFacts?: string[];
  projects?: Array<{ title?: string; description?: string; link?: string }>;
  work?: Array<{
    title?: string;
    organization?: string;
    start?: string;
    end?: string;
    description?: string;
    link?: string;
  }>;
  awards?: Array<{
    title?: string;
    issuer?: string;
    date?: string;
    description?: string;
  }>;
  customSections?: Array<{ title?: string; body?: string }>;
  hometown?: string;
  pledgeClass?: string;
  socialLinks?: Record<string, string>;
  profilePicUrl?: string;
  resumeUrl?: string;
  isHidden?: boolean;
}

type StatusFilter = "All" | "Active" | "Alumni" | "Removed" | "Deceased";

export default function MembersList({
  initialMembers,
}: {
  initialMembers: MemberData[];
}) {
  const [me, setMe] = useState<{ role: string; rollNo: string } | null>(null);
  const [members, setMembers] = useState<MemberData[]>(initialMembers);
  const [editingRollNo, setEditingRollNo] = useState<string | null>(null);
  const [deletingRollNo, setDeletingRollNo] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [showQuickTools, setShowQuickTools] = useState(false);
  const [quickToolsTool, setQuickToolsTool] = useState<
    "election" | "graduations"
  >("election");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("Active");
  const [loadingMembers, setLoadingMembers] = useState(true);
  const { isLoaded, isSignedIn } = useAuth();

  const refreshMembers = useCallback(async () => {
    setLoadingMembers(true);
    try {
      const response = await fetch("/api/members");
      if (!response.ok) throw new Error("Unable to load members");
      setMembers((await response.json()) as MemberData[]);
    } catch {
      setMembers(initialMembers);
    } finally {
      setLoadingMembers(false);
    }
  }, [initialMembers]);

  useEffect(() => {
    let active = true;

    fetch("/api/members/me")
      .then((response) => response.json())
      .then((data) => {
        if (active) setMe({ role: data.role, rollNo: data.rollNo });
      })
      .catch(() => {
        if (active) setMe(null);
      });

    void refreshMembers();

    return () => {
      active = false;
    };
  }, [refreshMembers]);

  const visibleMembers = members;

  const filteredMembers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = visibleMembers.filter((member) => {
      const matchesStatus =
        statusFilter === "All" || (member.status ?? "Active") === statusFilter;
      const haystack = [
        member.rollNo,
        member.fName,
        member.lName,
        member.status,
        member.ecouncilPosition,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return matchesStatus && (!normalizedQuery || haystack.includes(normalizedQuery));
    });

    return [...filtered].sort((a, b) => {
      const aRoll = Number(String(a.rollNo).replace(/\D/g, "")) || 0;
      const bRoll = Number(String(b.rollNo).replace(/\D/g, "")) || 0;
      return statusFilter === "Active" ? aRoll - bRoll : bRoll - aRoll;
    });
  }, [query, statusFilter, visibleMembers]);

  const currentUser =
    members.find((member) => member.rollNo === me?.rollNo) ?? null;
  const editing = editingRollNo
    ? members.find((member) => member.rollNo === editingRollNo) ?? null
    : null;
  const deleting = deletingRollNo
    ? members.find((member) => member.rollNo === deletingRollNo) ?? null
    : null;
  const canUseChapterTools = Boolean(
    me?.role === "superadmin" ||
      me?.role === "admin" ||
      (currentUser?.isECouncil &&
        ["Regent", "Vice Regent"].includes(currentUser.ecouncilPosition))
  );

  async function handleSave(updates: Partial<MemberData>) {
    if (!editing) return;
    setSaveError("");

    const response = await fetch(`/api/members/${editing.rollNo}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setSaveError(data.error || "The member could not be updated.");
      throw new Error(data.error || "The member could not be updated.");
    }

    const updated = (await response.json()) as MemberData;
    setMembers((current) =>
      current.map((member) =>
        member.rollNo === editing.rollNo ? { ...member, ...updated } : member
      )
    );
  }

  async function confirmDelete() {
    if (!deletingRollNo) return;
    setDeleteLoading(true);
    setDeleteError("");

    try {
      const response = await fetch(`/api/members/${deletingRollNo}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "The member could not be deleted.");
      }

      setMembers((current) =>
        current.filter((member) => member.rollNo !== deletingRollNo)
      );
      setDeletingRollNo(null);
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "The member could not be deleted."
      );
    } finally {
      setDeleteLoading(false);
    }
  }

  function openQuickTool(tool: "election" | "graduations") {
    setQuickToolsTool(tool);
    setShowQuickTools(true);
  }

  if (!isLoaded) return <LoadingState message="Loading members..." />;

  if (!isSignedIn) {
    return (
      <PageContainer>
        <Alert variant="destructive">
          <CircleAlert className="size-4" />
          <AlertTitle>Sign in required</AlertTitle>
          <AlertDescription>
            You must be signed in to manage chapter members.
          </AlertDescription>
        </Alert>
        <RedirectToSignIn />
      </PageContainer>
    );
  }

  return (
    <PageContainer className="max-w-7xl space-y-6">
      <PageHeader
        title="Member administration"
        description="Search the chapter roster, update member access, and run semester-wide changes."
      />

      {saveError ? (
        <Alert variant="destructive">
          <CircleAlert className="size-4" />
          <AlertTitle>Member update failed</AlertTitle>
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      ) : null}

      <Tabs defaultValue="members" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 sm:w-[28rem]">
          <TabsTrigger value="members" className="gap-2">
            <Users className="size-4" />
            Members
          </TabsTrigger>
          <TabsTrigger value="tools" className="gap-2">
            <UserCog className="size-4" />
            Chapter tools
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="space-y-6">
          <Card className="overflow-hidden">
            <CardHeader className="gap-4 border-b xl:flex-row xl:items-end xl:justify-between">
              <div className="space-y-1.5">
                <CardTitle>Chapter roster</CardTitle>
                <CardDescription>
                  Showing {filteredMembers.length} of {visibleMembers.length} members.
                </CardDescription>
              </div>
              <div className="grid w-full min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_11rem] xl:w-[32rem]">
                {/* Flex field, not an absolutely-positioned icon over a padded
                  * input: `cn()` keeps both `px-3` (from the Input base) and any
                  * `pl-*` override, so clearance depended on CSS source order.
                  * Laying the icon, field, and clear button out in a row makes
                  * overlap structurally impossible. */}
                <div className="flex h-10 min-w-0 items-center gap-2 rounded-md border border-input bg-background px-3 ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                  <Search
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-muted-foreground"
                  />
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search members…"
                    aria-label="Search members"
                    className="m-0 h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:appearance-none"
                  />
                  {query ? (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      aria-label="Clear member search"
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
                  <SelectTrigger aria-label="Filter members by status">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All statuses</SelectItem>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Alumni">Alumni</SelectItem>
                    <SelectItem value="Removed">Removed</SelectItem>
                    <SelectItem value="Deceased">Deceased</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Member</TableHead>
                    <TableHead className="hidden sm:table-cell">Roll</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden lg:table-cell">Access</TableHead>
                    <TableHead className="w-14 pr-6">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingMembers ? (
                    Array.from({ length: 5 }).map((_, index) => (
                      <TableRow key={index}>
                        <TableCell className="pl-6">
                          <div className="flex items-center gap-3">
                            <Skeleton className="size-10 rounded-full" />
                            <div className="space-y-2">
                              <Skeleton className="h-4 w-32" />
                              <Skeleton className="h-3 w-20" />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Skeleton className="h-4 w-12" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-6 w-16 rounded-full" />
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <Skeleton className="h-6 w-24 rounded-full" />
                        </TableCell>
                        <TableCell className="pr-6">
                          <Skeleton className="size-8 rounded-md" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : filteredMembers.length ? (
                    filteredMembers.map((member) => (
                      <MemberRow
                        key={member._id || member.rollNo}
                        member={member}
                        isCurrentUser={member.rollNo === me?.rollNo}
                        canDelete={
                          me?.role === "admin" || me?.role === "superadmin"
                        }
                        onEdit={() => {
                          setSaveError("");
                          setEditingRollNo(member.rollNo);
                        }}
                        onDelete={() => {
                          setDeleteError("");
                          setDeletingRollNo(member.rollNo);
                        }}
                      />
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="h-56 text-center">
                        <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
                          <div className="rounded-full bg-muted p-3">
                            <Search className="size-5 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="font-medium">No members found</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              Try a different search or status filter.
                            </p>
                          </div>
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
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tools">
          <Card>
            <CardHeader>
              <CardTitle>Semester tools</CardTitle>
              <CardDescription>
                Chapter-wide changes are grouped here so they do not compete with
                everyday roster work.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <ToolRow
                icon={Vote}
                title="Officer election"
                description="Assign the incoming executive council and chapter officers."
                onClick={() => openQuickTool("election")}
                disabled={!canUseChapterTools}
              />
              <ToolRow
                icon={GraduationCap}
                title="Graduate members"
                description="Move a graduating class from Active to Alumni in one review."
                onClick={() => openQuickTool("graduations")}
                disabled={!canUseChapterTools}
              />
              {!canUseChapterTools ? (
                <Alert className="md:col-span-2">
                  <ShieldCheck className="size-4" />
                  <AlertTitle>Restricted tools</AlertTitle>
                  <AlertDescription>
                    Only chapter administrators, the Regent, and the Vice Regent can
                    run these changes.
                  </AlertDescription>
                </Alert>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {showQuickTools ? (
        <QuickToolsModal
          show={showQuickTools}
          initialTool={quickToolsTool}
          members={visibleMembers}
          canSubmitQuickTools={canUseChapterTools}
          onClose={() => setShowQuickTools(false)}
          onCompleted={refreshMembers}
        />
      ) : null}

      {editing ? (
        <MemberEditorModal
          member={editing}
          show={Boolean(editing)}
          onClose={() => setEditingRollNo(null)}
          onSave={handleSave}
        />
      ) : null}

      <AlertDialog
        open={Boolean(deletingRollNo)}
        onOpenChange={(open) => {
          if (!open && !deleteLoading) {
            setDeletingRollNo(null);
            setDeleteError("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this member?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting
                ? `${deleting.fName} ${deleting.lName} (#${deleting.rollNo}) will be permanently removed from the chapter roster.`
                : "This member will be permanently removed from the chapter roster."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError ? (
            <Alert variant="destructive">
              <CircleAlert className="size-4" />
              <AlertDescription>{deleteError}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteLoading}
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
            >
              {deleteLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              {deleteLoading ? "Deleting…" : "Delete member"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}

function MemberRow({
  member,
  isCurrentUser,
  canDelete,
  onEdit,
  onDelete,
}: {
  member: MemberData;
  isCurrentUser: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const initials = `${member.fName?.[0] ?? ""}${member.lName?.[0] ?? ""}`;
  const accessLabels = [
    member.role === "admin" || member.role === "superadmin" ? "Admin" : null,
    member.isECouncil ? member.ecouncilPosition || "E-Council" : null,
    member.isCommitteeHead ? "Committee head" : null,
  ].filter(Boolean) as string[];

  return (
    <TableRow>
      <TableCell className="pl-6">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="size-10 border">
            {member.profilePicUrl ? (
              <AvatarImage
                src={member.profilePicUrl}
                alt={`${member.fName} ${member.lName}`}
              />
            ) : null}
            <AvatarFallback className="text-xs font-semibold">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-medium">
              {member.fName} {member.lName}
              {isCurrentUser ? (
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  (you)
                </span>
              ) : null}
            </p>
            <p className="truncate text-xs text-muted-foreground sm:hidden">
              Roll #{member.rollNo}
            </p>
            {member.isHidden ? (
              <p className="mt-0.5 text-xs text-muted-foreground">Directory hidden</p>
            ) : null}
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden font-mono text-sm sm:table-cell">
        #{member.rollNo}
      </TableCell>
      <TableCell>
        <StatusBadge status={member.status ?? "Active"} />
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        <div className="flex flex-wrap gap-1.5">
          {accessLabels.length ? (
            accessLabels.slice(0, 2).map((label) => (
              <Badge key={label} variant="secondary">
                {label}
              </Badge>
            ))
          ) : (
            <span className="text-sm text-muted-foreground">Member</span>
          )}
          {accessLabels.length > 2 ? (
            <Badge variant="outline">+{accessLabels.length - 2}</Badge>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="pr-6 text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`Actions for ${member.fName} ${member.lName}`}>
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Member actions</DropdownMenuLabel>
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil className="size-4" />
              Edit member
            </DropdownMenuItem>
            {canDelete ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={onDelete}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="size-4" />
                  Delete member
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

function StatusBadge({ status }: { status: NonNullable<MemberData["status"]> }) {
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

function ToolRow({
  icon: Icon,
  title,
  description,
  onClick,
  disabled,
}: {
  icon: typeof Vote;
  title: string;
  description: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group flex w-full items-center gap-4 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
    >
      <span className="rounded-lg bg-muted p-3 text-primary">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        <span className="mt-1 block text-sm text-muted-foreground">{description}</span>
      </span>
      {disabled ? (
        <KeyRound className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      ) : (
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      )}
    </button>
  );
}
