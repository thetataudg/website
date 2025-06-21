// app/(members-only)/member/admin/members/MemberEditorModal.tsx
"use client";

import React, { useState, useEffect } from "react";

export interface MemberData {
  _id: string;
  rollNo: string;
  fName: string;
  lName: string;
  role: "superadmin" | "admin" | "member";
  isECouncil: boolean;
  ecouncilPosition: string;
  familyLine: string;
  bigs: string[];
  littles: string[];
}

interface MemberShort {
  _id: string;
  fName: string;
  lName: string;
}

interface Props {
  member: MemberData;
  show: boolean;
  onClose: () => void;
  onSave: (updates: {
    isECouncil: boolean;
    ecouncilPosition: string;
    familyLine: string;
    bigs: string[];
    littles: string[];
  }) => Promise<void>;
}

export default function MemberEditorModal({
  member,
  show,
  onClose,
  onSave,
}: Props) {
  const [form, setForm] = useState({
    isECouncil: member.isECouncil,
    ecouncilPosition: member.ecouncilPosition,
    familyLine: member.familyLine,
    big: member.bigs[0] || "",
    little: member.littles[0] || "",
  });
  const [allMembers, setAllMembers] = useState<MemberShort[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // reset form when modal opens
  useEffect(() => {
    if (show) {
      setForm({
        isECouncil: member.isECouncil,
        ecouncilPosition: member.ecouncilPosition,
        familyLine: member.familyLine,
        big: member.bigs[0] || "",
        little: member.littles[0] || "",
      });
      // fetch other members for dropdowns
      fetch("/api/members")
        .then((r) => r.json())
        .then((list: MemberData[]) => {
          setAllMembers(
            list
              .filter(
                (m) => m.role !== "superadmin" && m.rollNo !== member.rollNo
              )
              .map((m) => ({
                _id: m._id,
                fName: m.fName,
                lName: m.lName,
              }))
          );
        })
        .catch(console.error);
    }
  }, [show, member]);

  const update = <K extends keyof typeof form>(key: K, val: any) =>
    setForm((f) => ({ ...f, [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        isECouncil: form.isECouncil,
        ecouncilPosition: form.ecouncilPosition,
        familyLine: form.familyLine,
        bigs: form.big ? [form.big] : [],
        littles: form.little ? [form.little] : [],
      });
      // show success alert
      setSaved(true);
      // after 1.5s, hide alert and close modal
      setTimeout(() => {
        setSaved(false);
        onClose();
      }, 1500);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (!show) return null;
  return (
    <div
      className="modal fade show"
      style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)" }}
    >
      <div className="modal-dialog modal-lg">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Edit {member.fName}’s Info</h5>
            <button className="btn-close" onClick={onClose} />
          </div>

          {/* success alert */}
          {saved && (
            <div className="alert alert-success m-3">✔ Changes saved!</div>
          )}

          <div className="modal-body">
            {/* E-Council */}
            <div className="form-check mb-3">
              <input
                id="isECouncil"
                type="checkbox"
                className="form-check-input"
                checked={form.isECouncil}
                onChange={(e) => update("isECouncil", e.target.checked)}
              />
              <label htmlFor="isECouncil" className="form-check-label">
                E-Council
              </label>
            </div>
            {form.isECouncil && (
              <div className="mb-3">
                <label className="form-label">E-Council Position</label>
                <input
                  type="text"
                  className="form-control"
                  value={form.ecouncilPosition}
                  onChange={(e) => update("ecouncilPosition", e.target.value)}
                />
              </div>
            )}

            {/* Family Line */}
            <div className="mb-3">
              <label className="form-label">Family Line</label>
              <input
                type="text"
                className="form-control"
                value={form.familyLine}
                onChange={(e) => update("familyLine", e.target.value)}
              />
            </div>

            <div className="row">
              {/* Big */}
              <div className="col-md-6 mb-3">
                <label className="form-label">Big</label>
                <select
                  className="form-select"
                  value={form.big}
                  onChange={(e) => update("big", e.target.value)}
                >
                  <option value="">None</option>
                  {allMembers.map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.fName} {m.lName}
                    </option>
                  ))}
                </select>
              </div>
              {/* Little */}
              <div className="col-md-6 mb-3">
                <label className="form-label">Little</label>
                <select
                  className="form-select"
                  value={form.little}
                  onChange={(e) => update("little", e.target.value)}
                >
                  <option value="">None</option>
                  {allMembers.map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.fName} {m.lName}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button
              className="btn btn-secondary"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
