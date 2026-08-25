"use client";

import React, { useEffect, useId, useMemo, useState } from "react";
import { ArrowRight, Check, ChevronsUpDown, KeyRound, X } from "lucide-react";

import { LoadingSpinner } from "../../../components/LoadingState";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const ELECTION_POSITIONS = [
  "Regent",
  "Vice Regent",
  "Marshal",
  "Treasurer",
  "Scribe",
  "Corresponding Secretary",
  "Regent Emeritus",
] as const;

type ElectionPosition = (typeof ELECTION_POSITIONS)[number];

type QuickToolMember = {
  rollNo: string;
  fName: string;
  lName: string;
  status?: string;
  role?: string;
  isECouncil?: boolean;
  ecouncilPosition?: string;
  isHidden?: boolean;
};

type ToolMode = "election" | "graduations" | "purgeCommittees";

interface Props {
  show: boolean;
  initialTool: ToolMode;
  /// Only read by the election and graduation tools. The committees page opens
  /// this on `purgeCommittees`, which needs nobody, so it defaults to empty
  /// rather than making that caller fetch a roster it has no use for.
  members?: QuickToolMember[];
  canSubmitQuickTools: boolean;
  onClose: () => void;
  onCompleted: () => Promise<void>;
}

const ADMIN_POSITIONS = new Set<ElectionPosition>([
  "Regent",
  "Vice Regent",
  "Treasurer",
  "Scribe",
]);

const normalizeRollNo = (value: unknown) => String(value || "").trim();
const byRollNoAsc = (a: QuickToolMember, b: QuickToolMember) => {
  const aNum = Number(normalizeRollNo(a.rollNo).replace(/\D/g, "")) || 0;
  const bNum = Number(normalizeRollNo(b.rollNo).replace(/\D/g, "")) || 0;
  return aNum - bNum;
};

export default function QuickToolsModal({
  show,
  initialTool,
  members = [],
  canSubmitQuickTools,
  onClose,
  onCompleted,
}: Props) {
  const fieldId = useId();
  const [activeTool, setActiveTool] = useState<ToolMode>(initialTool);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [electionAssignments, setElectionAssignments] = useState<
    Record<ElectionPosition, string>
  >({
    Regent: "",
    "Vice Regent": "",
    Marshal: "",
    Treasurer: "",
    Scribe: "",
    "Corresponding Secretary": "",
    "Regent Emeritus": "",
  });
  const [graduationSelection, setGraduationSelection] = useState<
    Record<string, boolean>
  >({});

  const visibleMembers = useMemo(
    () => members.filter((member) => !member.isHidden),
    [members]
  );

  const activeMembers = useMemo(
    () =>
      visibleMembers
        .filter((member) => member.status === "Active")
        .sort(byRollNoAsc),
    [visibleMembers]
  );

  const eligibleElectionMembers = useMemo(
    () =>
      visibleMembers
        .filter((member) => member.status === "Active")
        .sort(byRollNoAsc),
    [visibleMembers]
  );

  const currentBoardByPosition = useMemo(() => {
    const map = new Map<ElectionPosition, QuickToolMember>();
    visibleMembers.forEach((member) => {
      if (member.isECouncil && member.ecouncilPosition) {
        const position = member.ecouncilPosition as ElectionPosition;
        if (ELECTION_POSITIONS.includes(position) && !map.has(position)) {
          map.set(position, member);
        }
      }
    });
    return map;
  }, [visibleMembers]);

  const currentRegent = currentBoardByPosition.get("Regent");
  const currentRegentEmeritus = currentBoardByPosition.get("Regent Emeritus");

  useEffect(() => {
    if (!show) return;

    setActiveTool(initialTool);
    setShowConfirmation(initialTool === "purgeCommittees");
    setError(null);
    setSaving(false);
    setGraduationSelection({});
    setElectionAssignments({
      Regent: "",
      "Vice Regent": currentBoardByPosition.get("Vice Regent")?.rollNo || "",
      Marshal: currentBoardByPosition.get("Marshal")?.rollNo || "",
      Treasurer: currentBoardByPosition.get("Treasurer")?.rollNo || "",
      Scribe: currentBoardByPosition.get("Scribe")?.rollNo || "",
      "Corresponding Secretary":
        currentBoardByPosition.get("Corresponding Secretary")?.rollNo || "",
      "Regent Emeritus":
        currentRegent?.rollNo || currentRegentEmeritus?.rollNo || "",
    });
  }, [currentBoardByPosition, currentRegent, currentRegentEmeritus, initialTool, show]);

  const currentOccupantLabel = (position: ElectionPosition) => {
    const member = currentBoardByPosition.get(position);
    if (!member) return "None Assigned";
    return `#${member.rollNo} ${member.fName} ${member.lName}`;
  };

  const selectedMemberLabel = (rollNo: string) => {
    const member = visibleMembers.find((entry) => entry.rollNo === rollNo);
    if (!member) return "None Assigned";
    return `${member.fName} ${member.lName}`;
  };

  const selectedValues = new Set(
    Object.values(electionAssignments)
      .map((value) => normalizeRollNo(value))
      .filter(Boolean)
  );

  // const filteredElectionMembers = (position: ElectionPosition) => {
  //   const currentValue = normalizeRollNo(electionAssignments[position]);
  //   return eligibleElectionMembers.filter((member) => {
  //     const otherSelections = new Set(
  //       Object.entries(electionAssignments)
  //         .filter(([otherPosition, rollNo]) => otherPosition !== position && normalizeRollNo(rollNo))
  //         .map(([, rollNo]) => normalizeRollNo(rollNo))
  //     );
  //     const isAllowed = !otherSelections.has(member.rollNo) || currentValue === member.rollNo;
  //     return isAllowed;
  //   });
  // };

  const filteredElectionMembers = (position: ElectionPosition) => {
    const currentValue = normalizeRollNo(electionAssignments[position]);
    const currentOccupantRollNo = normalizeRollNo(currentBoardByPosition.get(position)?.rollNo);
    return eligibleElectionMembers.filter((member) => {
      const otherSelections = new Set(
        Object.entries(electionAssignments)
          .filter(([otherPosition, rollNo]) => otherPosition !== position && normalizeRollNo(rollNo))
          .map(([, rollNo]) => normalizeRollNo(rollNo))
      );
      const isCurrentOccupant =
        !!currentOccupantRollNo &&
        member.rollNo === currentOccupantRollNo &&
        !otherSelections.has(member.rollNo); // ← don't bypass if already assigned elsewhere
      const memberIsOnBoardElsewhere = Array.from(currentBoardByPosition.entries()).some(
        ([otherPosition, occupant]) =>
          otherPosition !== position && occupant.rollNo === member.rollNo
      );
      const isAllowed =
        !otherSelections.has(member.rollNo) ||
        currentValue === member.rollNo ||
        isCurrentOccupant ||
        (!currentValue && memberIsOnBoardElsewhere);
      return isAllowed;
    });
  };

  const updateElectionAssignment = (position: ElectionPosition, rollNo: string) => {
    setElectionAssignments((current) => ({ ...current, [position]: rollNo }));
  };

  const updateGraduationSelection = (rollNo: string, checked: boolean) => {
    setGraduationSelection((current) => ({ ...current, [rollNo]: checked }));
  };

  const handlePurgeCommitteesSubmit = async () => {
    if (!canSubmitQuickTools) {
      setError(
        "You don't have access to submit this quick tool. It must be done by an admin, the Regent, or the Vice Regent."
      );
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/members/quick-tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "purgeCommittees" }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || "Failed to purge committees");
      }
      await onCompleted();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to purge committees");
    } finally {
      setSaving(false);
    }
  };

  const openConfirmation = () => {
    if (!canSubmitQuickTools) {
      setError(
        "You don't have access to submit this quick tool. It must be done by an admin, the Regent, or the Vice Regent."
      );
      return;
    }

    if (activeTool === "purgeCommittees") {
      setError(null);
      setShowConfirmation(true);
      return;
    }

    if (activeTool === "election") {
      const missingPositions = ELECTION_POSITIONS.filter(
        (position) => !normalizeRollNo(electionAssignments[position])
      );
      if (missingPositions.length) {
        setError(`Please assign a member to ${missingPositions.join(", ")}.`);
        return;
      }

      const rollNos = ELECTION_POSITIONS.map((position) =>
        normalizeRollNo(electionAssignments[position])
      );
      if (new Set(rollNos).size !== rollNos.length) {
        setError("Each election position must be assigned to a unique member.");
        return;
      }
    }

    if (activeTool === "graduations") {
      const selectedCount = activeMembers.filter(
        (member) => graduationSelection[member.rollNo]
      ).length;
      if (!selectedCount) {
        setError("Select at least one active member to graduate.");
        return;
      }
    }

    setError(null);
    setShowConfirmation(true);
  };

  const handleElectionSubmit = async () => {
    if (!canSubmitQuickTools) {
      setError(
        "You don't have access to submit this quick tool. It must be done by an admin, the Regent, or the Vice Regent."
      );
      return;
    }

    const missingPositions = ELECTION_POSITIONS.filter(
      (position) => !normalizeRollNo(electionAssignments[position])
    );
    if (missingPositions.length) {
      setError(`Please assign a member to ${missingPositions.join(", ")}.`);
      return;
    }

    const rollNos = ELECTION_POSITIONS.map((position) =>
      normalizeRollNo(electionAssignments[position])
    );
    if (new Set(rollNos).size !== rollNos.length) {
      setError("Each election position must be assigned to a unique member.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/members/quick-tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "election",
          assignments: electionAssignments,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || "Failed to run officer election");
      }
      await onCompleted();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to run officer election");
    } finally {
      setSaving(false);
    }
  };

  const handleGraduationsSubmit = async () => {
    if (!canSubmitQuickTools) {
      setError(
        "You don't have access to submit this quick tool. It must be done by an admin, the Regent, or the Vice Regent."
      );
      return;
    }

    const rollNos = activeMembers
      .filter((member) => graduationSelection[member.rollNo])
      .map((member) => member.rollNo);

    if (!rollNos.length) {
      setError("Select at least one active member to graduate.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/members/quick-tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "graduations",
          rollNos,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || "Failed to graduate members");
      }
      await onCompleted();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to graduate members");
    } finally {
      setSaving(false);
    }
  };

  if (!show) return null;

  const reviewEntries =
    activeTool === "election"
      ? ELECTION_POSITIONS.map((position) => ({
          position,
          memberLabel: selectedMemberLabel(electionAssignments[position]),
        }))
      : activeMembers
          .filter((member) => graduationSelection[member.rollNo])
          .map((member) => ({
            position: member.rollNo,
            memberLabel: `${member.fName} ${member.lName}`,
          }));

  const modalTitle =
    activeTool === "election"
      ? "Officer Election"
      : activeTool === "graduations"
      ? "Graduations"
      : "Purge Committees";

  const modalDescription =
    activeTool === "election"
      ? "Assigns chapter officer privileges to newly elected officers. Use this tool only after initiation of new officers as permission and role updates take effect upon submission."
      : activeTool === "graduations"
      ? "Move selected active members to Alumni status."
      : "Prepare committee assignment for next semester by purging committee membership.";

  const primaryAction = showConfirmation
    ? activeTool === "election"
      ? handleElectionSubmit
      : activeTool === "graduations"
      ? handleGraduationsSubmit
      : handlePurgeCommitteesSubmit
    : openConfirmation;

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !saving) onClose();
      }}
    >
      <DialogContent
        className="grid max-h-[85dvh] w-[calc(100%-2rem)] max-w-3xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0"
        /* The old Bootstrap shell had no backdrop dismissal, and a stray click
         * outside would discard a half-filled election. Escape still closes,
         * which the previous shell did not support. */
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="border-b border-border px-6 py-5 pr-12 text-left">
          <DialogTitle>{modalTitle}</DialogTitle>
          <DialogDescription>{modalDescription}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto px-6 py-5">
          {!canSubmitQuickTools && (
            <Alert variant="warning">
              <X aria-hidden="true" />
              <AlertDescription>
                Only an admin, the Regent, or the Vice Regent has access to this
                tool. Please contact leadership if you believe this is an error.
              </AlertDescription>
            </Alert>
          )}

          {/* Visible in BOTH steps: a failed submit happens on the confirmation
            * screen, where the old markup rendered no error at all. */}
          {error && (
            <Alert variant="destructive" role="alert">
              <X aria-hidden="true" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div
            className={cn(
              "space-y-4",
              !canSubmitQuickTools && "pointer-events-none opacity-60"
            )}
          >
            {showConfirmation ? (
              activeTool === "purgeCommittees" ? (
                <>
                  <Alert variant="destructive">
                    <X aria-hidden="true" />
                    <AlertDescription>
                      <strong className="font-semibold">
                        Destructive action.
                      </strong>{" "}
                      All committees will remain, but membership and chair
                      assignments will be removed immediately and cannot be
                      undone.
                    </AlertDescription>
                  </Alert>
                  <div className="rounded-md border border-border p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Committees
                    </p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      All committee heads and members will be removed
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <Alert variant="warning">
                    <AlertDescription>
                      {activeTool === "election"
                        ? "Approving these changes will update chapter roles and will remove admin access immediately for members who lose an admin-granting position."
                        : "Please confirm that all members listed below will be moved to Alumni status."}
                    </AlertDescription>
                  </Alert>
                  <ul className="divide-y divide-border rounded-md border border-border">
                    {reviewEntries.map((entry) => (
                      <li key={entry.position} className="px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {activeTool === "election"
                            ? entry.position
                            : "Selected member"}
                        </p>
                        <p className="mt-0.5 text-sm font-semibold text-foreground">
                          {entry.memberLabel}
                        </p>
                      </li>
                    ))}
                  </ul>
                </>
              )
            ) : activeTool === "election" ? (
              <div className="space-y-3">
                {ELECTION_POSITIONS.map((position) => {
                  const currentValue = normalizeRollNo(
                    electionAssignments[position]
                  );
                  const options = filteredElectionMembers(position);
                  const isEmeritus = position === "Regent Emeritus";
                  const selectId = `${fieldId}-${position.replace(/\s+/g, "-")}`;
                  const grantsAdmin = ADMIN_POSITIONS.has(position);

                  return (
                    <div
                      key={position}
                      className="rounded-md border border-border p-4"
                    >
                      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.4fr)] lg:items-center">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {position}
                          </p>
                          <p className="mt-0.5 text-sm font-semibold text-foreground">
                            {currentOccupantLabel(position)}
                          </p>
                          {grantsAdmin && (
                            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                              <X className="size-3.5 shrink-0" aria-hidden="true" />
                              Admin permission will be revoked.
                            </p>
                          )}
                        </div>

                        <ArrowRight
                          aria-hidden="true"
                          className="hidden size-5 shrink-0 text-muted-foreground lg:block"
                        />

                        <div className="min-w-0 space-y-1.5">
                          <Label
                            htmlFor={selectId}
                            className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                          >
                            New assignment
                          </Label>
                          <MemberCombobox
                            id={selectId}
                            value={currentValue}
                            options={options}
                            disabled={saving}
                            onChange={(rollNo) =>
                              updateElectionAssignment(position, rollNo)
                            }
                          />
                          {isEmeritus && (
                            <p className="text-xs text-muted-foreground">
                              This defaults to the current Regent.
                            </p>
                          )}
                          {grantsAdmin && (
                            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <KeyRound
                                className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
                                aria-hidden="true"
                              />
                              This position grants admin permissions.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : activeTool === "purgeCommittees" ? (
              <Alert variant="destructive">
                <X aria-hidden="true" />
                <AlertDescription>
                  This action is destructive and cannot be undone.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {activeMembers.length} active members available for
                  graduation.
                </p>
                <ul className="space-y-2">
                  {activeMembers.map((member) => {
                    const boxId = `${fieldId}-grad-${member.rollNo}`;
                    const checked = Boolean(graduationSelection[member.rollNo]);
                    return (
                      <li
                        key={member.rollNo}
                        className={cn(
                          "flex items-center justify-between gap-3 rounded-md border p-3 transition-colors",
                          checked
                            ? "border-primary/60 bg-accent/40"
                            : "border-border"
                        )}
                      >
                        <Label
                          htmlFor={boxId}
                          className="min-w-0 flex-1 cursor-pointer"
                        >
                          <span className="block truncate text-sm font-semibold text-foreground">
                            {member.fName} {member.lName}
                          </span>
                          <span className="block text-xs font-normal text-muted-foreground">
                            Active
                          </span>
                        </Label>
                        <Checkbox
                          id={boxId}
                          checked={checked}
                          disabled={saving}
                          onCheckedChange={(value) =>
                            updateGraduationSelection(
                              member.rollNo,
                              value === true
                            )
                          }
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 border-t border-border px-6 py-4">
          {showConfirmation && activeTool !== "purgeCommittees" ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowConfirmation(false)}
              disabled={saving}
            >
              Back
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
          )}
          <Button
            type="button"
            onClick={primaryAction}
            disabled={saving || !canSubmitQuickTools}
          >
            {saving ? (
              <LoadingSpinner size="sm" />
            ) : showConfirmation ? (
              <Check aria-hidden="true" />
            ) : null}
            {saving
              ? "Saving..."
              : showConfirmation
              ? "Approve Changes"
              : "Review Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Searchable member picker. With 447 members a plain dropdown is unusable, so
 * this is a `Popover` + `Command` combobox: type to filter (cmdk's default
 * scoring is a fuzzy subsequence match), then pick a result. Roll numbers are
 * part of each item's search value, so "#426" finds a member too.
 *
 * `""` still means unassigned, which the validation and POST payload rely on.
 */
function MemberCombobox({
  id,
  value,
  options,
  disabled,
  onChange,
}: {
  id: string;
  value: string;
  options: QuickToolMember[];
  disabled?: boolean;
  onChange: (rollNo: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((member) => member.rollNo === value);
  const label = selected
    ? `${selected.fName} ${selected.lName}`
    : "None Assigned";

  const choose = (rollNo: string) => {
    onChange(rollNo);
    setOpen(false);
  };

  return (
    /* `modal` is required here: PopoverContent portals to <body>, outside the
     * Dialog's focus trap, so without it the trap pulls focus back and the
     * search field cannot be typed into. */
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {label}
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
              <CommandItem value="None Assigned" onSelect={() => choose("")}>
                <Check
                  aria-hidden="true"
                  className={cn(!selected ? "opacity-100" : "opacity-0")}
                />
                None Assigned
              </CommandItem>
              {options.map((member) => (
                <CommandItem
                  key={member.rollNo}
                  /* Roll number keeps the value unique for members who share a
                   * name, and makes "#426" a valid search. */
                  value={`${member.fName} ${member.lName} ${member.rollNo}`}
                  onSelect={() => choose(member.rollNo)}
                >
                  <Check
                    aria-hidden="true"
                    className={cn(
                      value === member.rollNo ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="truncate">
                    {member.fName} {member.lName}
                  </span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    #{member.rollNo}
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
