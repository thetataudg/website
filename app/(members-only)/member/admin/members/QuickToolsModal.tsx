"use client";

import React, { useEffect, useMemo, useState } from "react";
import { LoadingSpinner } from "../../../components/LoadingState";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faKey, faTimes } from "@fortawesome/free-solid-svg-icons";

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
  members: QuickToolMember[];
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
  members,
  canSubmitQuickTools,
  onClose,
  onCompleted,
}: Props) {
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
    () =>
      members.filter(
        (member) => member.role !== "superadmin" && !member.isHidden
      ),
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
        "You don't have access to submit this quick tool. It must be done by the Regent or Vice Regent."
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
        "You don't have access to submit this quick tool. It must be done by the Regent or Vice Regent."
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
        "You don't have access to submit this quick tool. It must be done by the Regent or Vice Regent."
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
        "You don't have access to submit this quick tool. It must be done by the Regent or Vice Regent."
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

  return (
    <div
      className="modal d-block"
      style={{ backgroundColor: "rgba(0,0,0,0.65)" }}
      aria-modal="true"
      role="dialog"
    >
      <div className="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
        <div className="modal-content vote-modal">
          <div className="modal-header vote-modal__header">
            <div>
              <h5 className="modal-title mb-1">
                {modalTitle}
              </h5>
              <div className="small">
                {modalDescription}
              </div>
            </div>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>
          <div className="modal-body">
            {!canSubmitQuickTools && (
              <div className="alert alert-warning d-flex align-items-center gap-2">
                <FontAwesomeIcon icon={faTimes} />
                <span>
                  Only the current Regent or Vice Regent has access to this tool. Please contact leadership if you believe this is an error.
                </span>
              </div>
            )}
            <div className={!canSubmitQuickTools ? "opacity-50 pe-none" : ""}>
              {showConfirmation ? (
                <div className="d-flex flex-column gap-3">
                {activeTool === "purgeCommittees" ? (
                  <>
                    <div className="alert alert-danger mb-0">
                      <strong>Destructive action.</strong> All committees will remain, but membership and chair assignments will be removed immediately and cannot be undone.
                    </div>
                    <div className="list-group">
                      <div className="list-group-item d-flex align-items-center justify-content-between py-3 px-3">
                        <div className="pe-3">
                          <div className="text-uppercase small fw-semibold ps-2">
                            Committees
                          </div>
                          <div className="fw-semibold ps-2">
                            All committee heads and members will be removed
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="alert alert-warning mb-0">
                      {activeTool === "election"
                        ? "Approving these changes will update chapter roles and will remove admin access immediately for members who lose an admin-granting position."
                        : "Please confirm that all members listed below will be moved to Alumni status."}
                    </div>
                    <div className="list-group">
                      {reviewEntries.map((entry) => (
                        <div
                          key={entry.position}
                          className="list-group-item d-flex align-items-center justify-content-between py-3 px-3"
                        >
                          <div className="pe-3">
                            <div className="text-uppercase small fw-semibold ps-2">
                              {activeTool === "election" ? entry.position : "Selected member"}
                            </div>
                            <div className="fw-semibold ps-2">{entry.memberLabel}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                </div>
              ) : (
                <>
                {error && <div className="alert alert-danger">{error}</div>}

                {activeTool === "election" ? (
                  <div className="d-flex flex-column gap-3">
                    {ELECTION_POSITIONS.map((position) => {
                      const currentValue = normalizeRollNo(electionAssignments[position]);
                      const options = filteredElectionMembers(position);
                      const isEmeritus = position === "Regent Emeritus";
                      return (
                        <div key={position} className="list-group-item py-3">
                          <div className="row g-3 align-items-center">
                            <div className="col-12 col-lg-4">
                              <div className="text-uppercase small fw-semibold ps-2">
                                {position}
                              </div>
                              <div className="fw-semibold ps-2">
                                {currentOccupantLabel(position)}
                              </div>
                              {ADMIN_POSITIONS.has(position) && (
                                <div className="small d-flex align-items-center gap-1 ps-2 mt-1">
                                  <FontAwesomeIcon icon={faTimes} />
                                  Admin permission will be revoked.
                                </div>
                              )}
                            </div>
                            <div className="col-12 col-lg-1 text-center fs-4">
                              →
                            </div>
                            <div className="col-12 col-lg-7 py-1">
                              <label className="form-label small text-uppercase fw-semibold mb-1">
                                New assignment
                              </label>
                              <select
                                className="form-select"
                                value={currentValue}
                                onChange={(e) =>
                                  updateElectionAssignment(position, e.target.value)
                                }
                                disabled={saving}
                              >
                                <option value="">None Assigned</option>
                                {options.map((member) => (
                                  <option key={member.rollNo} value={member.rollNo}>
                                    {member.fName} {member.lName}
                                  </option>
                                ))}
                              </select>
                              {isEmeritus && (
                                <div className="form-text text-muted">
                                  This defaults to the current Regent.
                                </div>
                              )}
                              {ADMIN_POSITIONS.has(position) && (
                                <div className="form-text text-muted d-flex align-items-center gap-2">
                                  <FontAwesomeIcon icon={faKey} className="text-warning" />
                                  This position grants admin permissions.
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  activeTool === "purgeCommittees" ? (
                    <div className="alert alert-danger mb-0">
                      This action is destructive and cannot be undone.
                    </div>
                  ) : (
                    <div className="d-flex flex-column gap-2">
                      <div className="small">
                        {activeMembers.length} active members available for graduation.
                      </div>
                      {activeMembers.map((member) => (
                        <label
                          key={member.rollNo}
                          className="list-group-item d-flex align-items-center justify-content-between py-3 px-3 my-1"
                        >
                          <div>
                            <div className="fw-semibold">
                              {member.fName} {member.lName}
                            </div>
                            <div className="small">Active</div>
                          </div>
                          <input
                            className="form-check-input ms-3"
                            type="checkbox"
                            checked={Boolean(graduationSelection[member.rollNo])}
                            onChange={(e) =>
                              updateGraduationSelection(member.rollNo, e.target.checked)
                            }
                          />
                        </label>
                      ))}
                    </div>
                  )
                )}
                </>
              )}
            </div>
          </div>
          <div className="modal-footer">
            {showConfirmation && activeTool !== "purgeCommittees" ? (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowConfirmation(false)}
                disabled={saving}
              >
                Back
              </button>
            ) : (
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
                Cancel
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary"
              onClick={
                showConfirmation
                  ? activeTool === "election"
                    ? handleElectionSubmit
                    : activeTool === "graduations"
                    ? handleGraduationsSubmit
                    : handlePurgeCommitteesSubmit
                  : openConfirmation
              }
                disabled={saving || !canSubmitQuickTools}
            >
              {showConfirmation ? <FontAwesomeIcon icon={faCheck} className="me-2" /> : null}
              {saving && <LoadingSpinner size="sm" className="me-2" />}
              {saving
                ? "Saving..."
                : showConfirmation
                ? "Approve Changes"
                : activeTool === "purgeCommittees"
                ? "Review Changes"
                : "Review Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
