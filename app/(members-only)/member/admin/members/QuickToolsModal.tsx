"use client";

import React, { useEffect, useMemo, useState } from "react";
import { LoadingSpinner } from "../../../components/LoadingState";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck } from "@fortawesome/free-solid-svg-icons";

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

type ToolMode = "election" | "graduations";

interface Props {
  show: boolean;
  initialTool: ToolMode;
  members: QuickToolMember[];
  canManageElection: boolean;
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
  canManageElection,
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
    setShowConfirmation(false);
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

  const filteredElectionMembers = (position: ElectionPosition) => {
    const currentValue = normalizeRollNo(electionAssignments[position]);
    return eligibleElectionMembers.filter((member) => {
      const otherSelections = new Set(
        Object.entries(electionAssignments)
          .filter(([otherPosition, rollNo]) => otherPosition !== position && normalizeRollNo(rollNo))
          .map(([, rollNo]) => normalizeRollNo(rollNo))
      );
      const isAllowed = !otherSelections.has(member.rollNo) || currentValue === member.rollNo;
      return isAllowed;
    });
  };

  const updateElectionAssignment = (position: ElectionPosition, rollNo: string) => {
    setElectionAssignments((current) => ({ ...current, [position]: rollNo }));
  };

  const updateGraduationSelection = (rollNo: string, checked: boolean) => {
    setGraduationSelection((current) => ({ ...current, [rollNo]: checked }));
  };

  const openConfirmation = () => {
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
        throw new Error(payload.error || "Failed to run e-council election");
      }
      await onCompleted();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to run e-council election");
    } finally {
      setSaving(false);
    }
  };

  const handleGraduationsSubmit = async () => {
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
                {activeTool === "election" ? "E-Council Election" : "Graduations"}
              </h5>
              <div className="small">
                {activeTool === "election"
                  ? "Assign the next chapter leadership lineup."
                  : "Move selected active members to Alumni status."}
              </div>
            </div>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>
          <div className="modal-body">
            {showConfirmation ? (
              <div className="d-flex flex-column gap-3">
                <div className="alert alert-warning mb-0">
                  {activeTool === "election"
                    ? "Approving these changes will update chapter roles and will remove admin access immediately for members who lose an admin-granting position, potentially including you."
                    : "Please confirm these selections before moving the members to Alumni status."}
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
              </div>
            ) : (
              <>
                <div className="mb-4 d-flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={`btn btn-sm ${activeTool === "election" ? "btn-primary" : "btn-outline-primary"}`}
                    onClick={() => setActiveTool("election")}
                  >
                    E-Council Election
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${activeTool === "graduations" ? "btn-primary" : "btn-outline-primary"}`}
                    onClick={() => setActiveTool("graduations")}
                  >
                    Graduations
                  </button>
                </div>

                {error && <div className="alert alert-danger">{error}</div>}

                {activeTool === "election" ? (
                  <div className="d-flex flex-column gap-3">
                    {!canManageElection && (
                      <div className="alert alert-warning mb-0">
                        Only admins can submit election changes.
                      </div>
                    )}
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
                                <div className="form-text text-muted">
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
                )}
              </>
            )}
          </div>
          <div className="modal-footer">
            {showConfirmation ? (
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
              onClick={showConfirmation ? (activeTool === "election" ? handleElectionSubmit : handleGraduationsSubmit) : openConfirmation}
              disabled={saving}
            >
              {showConfirmation ? <FontAwesomeIcon icon={faCheck} className="me-2" /> : null}
              {saving && <LoadingSpinner size="sm" className="me-2" />}
              {saving ? "Saving..." : showConfirmation ? "Approve Changes" : "Review Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
