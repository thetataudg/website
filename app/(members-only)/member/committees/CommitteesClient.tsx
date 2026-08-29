// app/(members-only)/member/committees/CommitteesClient.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EventFormDialog } from "../events/EventFormDialog";
import CommitteeAttendance from "./CommitteeAttendance";
import {
  CalendarPlus,
  Crown,
  FileDown,
  LayoutGrid,
  List,
  Search,
  TriangleAlert,
  Users,
  X,
} from "lucide-react";

import { PageContainer, PageHeader } from "../../components/shell/PageShell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface MemberRef {
  _id?: string;
  fName?: string;
  lName?: string;
  rollNo?: string;
}

interface Committee {
  _id: string;
  name: string;
  description?: string;
  committeeHeadId?: string | MemberRef;
  committeeMembers?: Array<string | MemberRef>;
}

const formatMember = (member: string | MemberRef | undefined) => {
  if (!member) return "Unassigned";
  if (typeof member === "string") return member;
  const name = `${member.fName ?? ""} ${member.lName ?? ""}`.trim();
  const roll = member.rollNo ? ` (#${member.rollNo})` : "";
  return name ? `${name}${roll}` : "Unassigned";
};

const listMembers = (members?: Array<string | MemberRef>) =>
  (members || [])
    .map((member) => formatMember(member))
    .filter((label) => label && label !== "Unassigned");

export default function CommitteesClient({
  committees,
  error,
}: {
  committees: Committee[];
  error?: string | null;
}) {
  const [view, setView] = useState<"cards" | "list">("cards");
  const [selected, setSelected] = useState<Committee | null>(null);
  const [memberQuery, setMemberQuery] = useState("");
  const [scheduling, setScheduling] = useState<Committee | null>(null);
  const [viewer, setViewer] = useState<{
    memberId?: string;
    role?: string;
    isECouncil?: boolean;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/members/me");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setViewer(data);
      } catch {
        // Not knowing who is looking means not offering to schedule, which is
        // the safe direction: the API refuses anybody who should not.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /// Who may put something on a given committee's calendar.
  ///
  /// Any officer, or the head of that committee. Matched to what the events
  /// API accepts and to `canScheduleHere` in the iOS app, so the button is
  /// offered in exactly the same cases on both.
  const canScheduleFor = useCallback(
    (committee: Committee) => {
      if (!viewer) return false;
      if (
        viewer.role === "admin" ||
        viewer.role === "superadmin" ||
        viewer.isECouncil
      ) {
        return true;
      }
      const head = committee.committeeHeadId;
      const headId =
        typeof head === "string" ? head : (head as any)?._id?.toString?.();
      return Boolean(headId && viewer.memberId && headId === viewer.memberId);
    },
    [viewer]
  );

  const sortedCommittees = useMemo(() => {
    return [...committees].sort((a, b) => a.name.localeCompare(b.name));
  }, [committees]);

  const exportPdf = async () => {
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;

    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
    let logoData: string | null = null;
    try {
      const logoRes = await fetch("/crest-transparent.png");
      if (logoRes.ok) {
        const blob = await logoRes.blob();
        logoData = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
      }
    } catch (err) {
      console.error("Failed to load PDF logo", err);
    }

    if (logoData) {
      doc.addImage(logoData, "PNG", 40, 28, 44, 44);
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Theta Tau • Committee Directory", 94, 50);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(90);
    doc.text(`Generated ${new Date().toLocaleDateString()}`, 94, 66);
    doc.setTextColor(0);
    doc.setDrawColor(197, 173, 144);
    doc.line(40, 78, 572, 78);

    const tableRows = sortedCommittees.map((committee) => {
      const headLabel = formatMember(committee.committeeHeadId);
      const members = listMembers(committee.committeeMembers);
      return [
        committee.name,
        headLabel,
        members.length ? members.join("\n") : "No members assigned.",
      ];
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const marginX = 40;
    const tableWidth = pageWidth - marginX * 2;
    const colWidths = {
      committee: Math.floor(tableWidth * 0.28),
      head: Math.floor(tableWidth * 0.27),
    };
    const membersWidth = tableWidth - colWidths.committee - colWidths.head;

    autoTable(doc, {
      startY: 92,
      margin: { left: marginX, right: marginX },
      tableWidth,
      head: [["Committee", "Head", "Members"]],
      body: tableRows,
      styles: { fontSize: 9, cellPadding: 6, valign: "top" },
      headStyles: {
        fillColor: [139, 27, 35],
        textColor: 255,
        fontStyle: "bold",
      },
      alternateRowStyles: { fillColor: [250, 246, 240] },
      tableLineColor: [197, 173, 144],
      tableLineWidth: 0.5,
      columnStyles: {
        0: { cellWidth: colWidths.committee },
        1: { cellWidth: colWidths.head },
        2: { cellWidth: membersWidth },
      },
    });

    doc.save("committees.pdf");
  };

  const memberMatches = useMemo(() => {
    const query = memberQuery.trim().toLowerCase();
    if (!query) return [];
    const map = new Map<string, Set<string>>();
    sortedCommittees.forEach((committee) => {
      const head = formatMember(committee.committeeHeadId);
      const members = listMembers(committee.committeeMembers);
      const all = [head, ...members].filter((label) => label && label !== "Unassigned");
      all.forEach((label) => {
        const key = label.toLowerCase();
        if (!key.includes(query)) return;
        if (!map.has(label)) map.set(label, new Set());
        map.get(label)?.add(committee.name);
      });
    });
    return Array.from(map.entries())
      .map(([member, committees]) => ({
        member,
        committees: Array.from(committees).sort((a, b) => a.localeCompare(b)),
      }))
      .sort((a, b) => a.member.localeCompare(b.member));
  }, [memberQuery, sortedCommittees]);

  return (
    <PageContainer className="space-y-6">
      <PageHeader
        title="Committees"
        description={`${sortedCommittees.length} committee${
          sortedCommittees.length === 1 ? "" : "s"
        } this semester.`}
        actions={
          <>
            <Tabs
              value={view}
              onValueChange={(value) => setView(value as "cards" | "list")}
            >
              <TabsList aria-label="Committee layout">
                <TabsTrigger value="cards" className="gap-2">
                  <LayoutGrid className="size-4" />
                  Cards
                </TabsTrigger>
                <TabsTrigger value="list" className="gap-2">
                  <List className="size-4" />
                  List
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Button variant="outline" onClick={exportPdf}>
              <FileDown aria-hidden="true" />
              Export PDF
            </Button>
          </>
        }
      />

      {error && (
        <Alert variant="warning" role="alert">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Keep the icon, field, and clear control as flex siblings, matching
        * the proven roster search. No overlay or padding calculation means
        * the placeholder cannot collide with the icon. */}
      <div className="flex h-10 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-background px-3 ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 sm:max-w-sm">
        <Search
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-muted-foreground"
        />
        <input
          id="committee-search"
          type="search"
          placeholder="Search members…"
          aria-label="Search members"
          value={memberQuery}
          onChange={(event) => setMemberQuery(event.target.value)}
          className="m-0 h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:appearance-none"
        />
        {memberQuery ? (
          <button
            type="button"
            onClick={() => setMemberQuery("")}
            aria-label="Clear member search"
            className="-mr-1 flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {memberQuery.trim() && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Member committee matches</CardTitle>
          </CardHeader>
          <CardContent>
            {memberMatches.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No members match that search.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {memberMatches.map((match) => (
                  <li
                    key={match.member}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2 first:pt-0 last:pb-0"
                  >
                    <span className="font-medium text-foreground">
                      {match.member}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {match.committees.join(", ")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {sortedCommittees.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-muted">
              <Users className="size-5 text-muted-foreground" aria-hidden="true" />
            </div>
            <p className="font-medium">No committees available</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Committees appear here once they have been created.
            </p>
          </CardContent>
        </Card>
      ) : view === "cards" ? (
        <ul className="grid auto-rows-fr list-none items-stretch gap-4 p-0 md:grid-cols-2 xl:grid-cols-3">
          {sortedCommittees.map((committee) => {
            const headLabel = formatMember(committee.committeeHeadId);
            const members = listMembers(committee.committeeMembers);
            return (
              <li key={committee._id} className="h-full min-w-0">
                <Card className="h-full transition-colors hover:border-primary/50 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background">
                  <CardContent className="h-full p-4">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setSelected(committee)}
                      className="h-full min-h-40 w-full flex-col items-stretch justify-start whitespace-normal p-0 text-left hover:bg-transparent"
                    >
                      <span className="sr-only">
                        {`See the member list for ${committee.name}`}
                      </span>
                      <span className="flex w-full items-start justify-between gap-3">
                        <span className="min-w-0 text-lg font-semibold leading-snug text-foreground">
                          {committee.name}
                        </span>
                        <Badge variant="muted" className="shrink-0">
                          <Users aria-hidden="true" />
                          {members.length} member{members.length === 1 ? "" : "s"}
                        </Badge>
                      </span>

                      {committee.description && (
                        <span className="mt-2 line-clamp-2 block text-sm text-muted-foreground">
                          {committee.description}
                        </span>
                      )}

                      <span className="mt-auto block w-full border-t border-border pt-3">
                        <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Committee head
                        </span>
                        <span className="mt-1 flex items-start gap-1.5 text-sm text-foreground">
                          <Crown
                            aria-hidden="true"
                            className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                          />
                          <span className="min-w-0 break-words leading-snug">{headLabel}</span>
                        </span>
                      </span>
                    </Button>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      ) : (
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {sortedCommittees.map((committee) => {
              const headLabel = formatMember(committee.committeeHeadId);
              const members = listMembers(committee.committeeMembers);
              return (
                <div key={committee._id} className="space-y-2 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-base font-semibold text-foreground">
                      {committee.name}
                    </h2>
                    <Badge variant="muted">
                      <Crown aria-hidden="true" />
                      {headLabel}
                    </Badge>
                  </div>
                  {committee.description && (
                    <p className="text-sm text-muted-foreground">
                      {committee.description}
                    </p>
                  )}
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Members
                    </p>
                    {members.length === 0 ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        No members assigned.
                      </p>
                    ) : (
                      <ul className="mt-1.5 flex list-none flex-wrap gap-1.5 p-0">
                        {members.map((m) => (
                          <li key={`${committee._id}-${m}`}>
                            <Badge variant="outline">{m}</Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <section className="committee-print">
        <h1>Committee Directory</h1>
        {sortedCommittees.map((committee) => {
          const headLabel = formatMember(committee.committeeHeadId);
          const members = listMembers(committee.committeeMembers);
          return (
            <div key={`${committee._id}-print`} className="committee-print__block">
              <h2>{committee.name}</h2>
              <p className="committee-print__head">Head: {headLabel}</p>
              {committee.description && (
                <p className="committee-print__desc">{committee.description}</p>
              )}
              <div className="committee-print__members">
                {members.length ? (
                  <ul>
                    {members.map((m) => (
                      <li key={`${committee._id}-print-${m}`}>{m}</li>
                    ))}
                  </ul>
                ) : (
                  <p>No members assigned.</p>
                )}
              </div>
            </div>
          );
        })}
      </section>

      <Dialog
        open={selected !== null}
        onOpenChange={(next) => {
          if (!next) setSelected(null);
        }}
      >
        {selected && (
          <DialogContent className="w-[calc(100%-2rem)] max-w-md">
            <DialogHeader>
              <DialogTitle>{selected.name}</DialogTitle>
              <DialogDescription>
                {listMembers(selected.committeeMembers).length || 0} member
                {listMembers(selected.committeeMembers).length === 1 ? "" : "s"}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="rounded-md border border-border p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Committee head
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <Crown
                    aria-hidden="true"
                    className="size-3.5 shrink-0 text-muted-foreground"
                  />
                  {formatMember(selected.committeeHeadId)}
                </p>
              </div>

              {listMembers(selected.committeeMembers).length === 0 ? (
                <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  No members assigned.
                </p>
              ) : (
                <ul className="flex list-none flex-wrap gap-1.5 p-0">
                  {listMembers(selected.committeeMembers).map((m) => (
                    <li key={`${selected._id}-${m}`}>
                      <Badge variant="muted">{m}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Renders nothing for anybody the endpoint refuses, so it can sit
                here unconditionally rather than duplicating the permission
                rule a second time in the client. */}
            <CommitteeAttendance committeeId={selected._id} />

            <DialogFooter>
              {canScheduleFor(selected) ? (
                <Button
                  onClick={() => {
                    // The detail dialog closes first: two stacked dialogs
                    // trap focus in the wrong one and the date pickers inside
                    // the form end up unreachable.
                    const committee = selected;
                    setSelected(null);
                    setScheduling(committee);
                  }}
                >
                  <CalendarPlus className="mr-2 size-4" aria-hidden="true" />
                  Schedule a meeting
                </Button>
              ) : null}
              <Button variant="outline" onClick={() => setSelected(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <EventFormDialog
        open={scheduling !== null}
        onOpenChange={(open) => {
          if (!open) setScheduling(null);
        }}
        event={null}
        committees={committees}
        fixedCommitteeId={scheduling?._id ?? null}
        // Pinned to this committee: the point of starting here is not having
        // to say which one, and a chair may not schedule chapter-wide anyway.
        allowChapterWide={false}
        canChangeCommittee={false}
        onSaved={async () => {
          setScheduling(null);
        }}
      />
    </PageContainer>
  );
}
