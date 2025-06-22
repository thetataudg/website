// app/(members-only)/member/admin/members/MemberEditorModal.tsx
"use client";

import React, { useState, useEffect } from "react";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLock } from "@fortawesome/free-solid-svg-icons";

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
    role?: "admin" | "member";
  }) => Promise<void>;
  editorRole: "superadmin" | "admin";
}

export default function MemberEditorModal({
  member,
  show,
  onClose,
  onSave,
  editorRole,
}: Props) {
  const [form, setForm] = useState({
    isECouncil: member.isECouncil,
    ecouncilPosition: member.ecouncilPosition,
    familyLine: member.familyLine,
    big: member.bigs[0] || "",
    little: member.littles[0] || "",
    role: member.role,
  });
  const [allMembers, setAllMembers] = useState<MemberShort[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (show) {
      setForm({
        isECouncil: member.isECouncil,
        ecouncilPosition: member.ecouncilPosition,
        familyLine: member.familyLine,
        big: member.bigs[0] || "",
        little: member.littles[0] || "",
        role: member.role,
      });
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
        ...(editorRole === "superadmin" &&
          member.role !== "superadmin" &&
          (form.role === "admin" || form.role === "member")
            ? { role: form.role }
            : {}),
      });
      setSaved(true);
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

          {saved && (
            <div className="alert alert-success m-3">✔ Changes saved!</div>
          )}

          <div className="modal-body">
            {/* Admin status (only for superadmin, disabled for admin) */}
            <div className="form-check mb-3">
              <input
                id="isAdmin"
                type="checkbox"
                className="form-check-input"
                checked={form.role === "admin"}
                disabled={
                  editorRole !== "superadmin" ||
                  member.role === "superadmin"
                }
                onChange={(e) =>
                  update("role", e.target.checked ? "admin" : "member")
                }
              />
              <label htmlFor="isAdmin" className="form-check-label">
                Admin
              </label>
              {editorRole !== "superadmin" && (
                <FontAwesomeIcon icon={faLock} className="ms-2 text-muted" title="Only superadmins can change" />
              )}
            </div>

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