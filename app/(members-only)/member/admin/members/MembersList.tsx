// // app/(members-only)/member/admin/members/MembersList.tsx

"use client";

import React, { useState, useEffect } from "react";
import MemberEditorModal from "./MemberEditorModal";

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

  useEffect(() => {
    fetch("/api/members/me")
      .then((r) => r.json())
      .then((d) => setMe({ role: d.role, rollNo: d.rollNo }))
      .catch(() => setMe(null));
  }, []);

  // filter out superadmins, plus other-admins if I'm an admin
  const visible = members.filter((m) => {
    if (m.role === "superadmin") return false;
    if (!me) return false;
    if (me.role === "superadmin") return true;
    if (m.role === "admin" && m.rollNo !== me.rollNo) return false;
    return true;
  });

  const editing = editingRollNo
    ? members.find((m) => m.rollNo === editingRollNo) || null
    : null;

  async function handleSave(updates: Partial<MemberData>) {
    if (!editing) return;
    await fetch(`/api/members/${editing.rollNo}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    setMembers((ms) =>
      ms.map((m) => (m.rollNo === editing.rollNo ? { ...m, ...updates } : m))
    );
  }

  async function confirmDelete() {
    if (!deletingRollNo) return;

    setDeleteLoading(true);

    const res = await fetch(`/api/members/${deletingRollNo}`, {
      method: "DELETE",
    });

    if (res.ok) {
      setMembers((ms) => ms.filter((m) => m.rollNo !== deletingRollNo));
      setDeletingRollNo(null);
    } else {
      const { error } = await res.json();
      alert(`Failed to delete member: ${error}`);
    }

    setDeleteLoading(false);
  }

  return (
    <>
      <h2>Manage Members</h2>
      <table className="table table-striped">
        <thead>
          <tr>
            <th>Roll No</th>
            <th>Name</th>
            <th>Role</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((m) => (
            <tr key={m._id}>
              <td>#{m.rollNo}</td>
              <td>
                {m.fName} {m.lName}
              </td>
              <td>{m.role}</td>
              <td>
                <button
                  className="btn btn-sm btn-outline-primary me-2"
                  onClick={() => setEditingRollNo(m.rollNo)}
                >
                  Edit
                </button>

                {me?.role === "superadmin" && m.role !== "superadmin" && (
                  <button
                    className="btn btn-sm btn-outline-danger"
                    onClick={() => setDeletingRollNo(m.rollNo)}
                  >
                    Delete
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editing && (
        <MemberEditorModal
          member={editing}
          show={true}
          onClose={() => setEditingRollNo(null)}
          onSave={handleSave}
        />
      )}

      {/* Simple confirmation modal */}
      {deletingRollNo && (
        <div
          className="modal show"
          style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Confirm Delete</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setDeletingRollNo(null)}
                ></button>
              </div>
              <div className="modal-body">
                <p>
                  Are you sure you want to delete member #{deletingRollNo}? This
                  action cannot be undone.
                </p>
              </div>
              <div className="modal-footer">
                <button
                  className="btn btn-secondary"
                  onClick={() => setDeletingRollNo(null)}
                  disabled={deleteLoading}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-danger"
                  onClick={confirmDelete}
                  disabled={deleteLoading}
                >
                  {deleteLoading ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
