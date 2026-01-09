// // app/(members-only)/member/admin/members/MembersList.tsx

"use client";

import React, { useState, useEffect } from "react";
import MemberEditorModal from "./MemberEditorModal";

import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faKey, faGavel, faCheck, faTimes, faTriangleExclamation, faHourglass, faSpinner } from "@fortawesome/free-solid-svg-icons";

export interface MemberData {
  _id: string;
  rollNo: string;
  fName: string;
  lName: string;
  role: "superadmin" | "admin" | "member";
  status?: "Active" | "Alumni" | "Removed" | "Deceased";
  isECouncil: boolean;
  ecouncilPosition: string;
  isCommitteeHead: boolean;
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
  const [query, setQuery] = useState("");
  const [loadingMembers, setLoadingMembers] = useState(true);

  useEffect(() => {
    fetch("/api/members/me")
      .then((r) => r.json())
      .then((d) => setMe({ role: d.role, rollNo: d.rollNo }))
      .catch(() => setMe(null));
    fetch("/api/members")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: MemberData[]) => setMembers(data))
      .catch(() => setMembers(initialMembers))
      .finally(() => setLoadingMembers(false));
  }, []);

  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <div className="container">
        <div className="alert alert-info d-flex align-items-center mt-5" role="alert">
          <FontAwesomeIcon icon={faHourglass} className="h2" />
          <h2>Loading...</h2>
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="container">
        <div className="alert alert-danger d-flex align-items-center mt-5" role="alert">
          <FontAwesomeIcon icon={faTimes} className="h2" />
          <h3>You must be logged into use this function.</h3>
          <RedirectToSignIn />
        </div>
      </div>
    );
  }

  // filter out superadmins only
  const visible = members.filter((m) => m.role !== "superadmin");
  const filtered = query.trim()
    ? visible.filter((m) => {
        const haystack = `${m.rollNo} ${m.fName} ${m.lName} ${m.status ?? ""}`.toLowerCase();
        return haystack.includes(query.trim().toLowerCase());
      })
    : visible;
  const sorted = [...filtered].sort((a, b) => {
    const aNum = Number(String(a.rollNo).replace(/\D/g, "")) || 0;
    const bNum = Number(String(b.rollNo).replace(/\D/g, "")) || 0;
    return aNum - bNum;
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
      <div className="bento-card admin-table-card">
        <div className="admin-members-header">
          <h2>Manage Members</h2>
          <div className="admin-search">
            <input
              className="form-control"
              placeholder="Search members..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="table-responsive">
          <table className="table admin-table">
            <thead>
              <tr>
                <th>Roll No</th>
                <th>Name</th>
                <th>Status</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingMembers ? (
                <tr>
                  <td colSpan={4} className="text-center py-5">
                    <FontAwesomeIcon icon={faSpinner} className="me-2 fa-spin" />
                    Loading members...
                  </td>
                </tr>
              ) : (
                sorted.map((m) => (
                  <tr key={m._id}>
                    <td>#{m.rollNo}</td>
                    <td>
                      {m.fName} {m.lName}{" "}
                    {me && m.rollNo === me.rollNo && (
                      <span className="badge bg-primary ms-1">You</span>
                    )}
                  </td>
                  <td>
                    {m.status || "Unknown"}
                    {m.role === "admin" && (
                      <FontAwesomeIcon
                        icon={faKey}
                        className="ms-2 text-warning"
                        title="This user has admin privileges"
                      />
                    )}
                    {m.isECouncil && (
                      <FontAwesomeIcon
                        icon={faGavel}
                        className="ms-2 text-secondary"
                        title="E-Council Member"
                      />
                    )}
                  </td>
                  <td className="text-end">
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
                ))
              )}
              {!loadingMembers && sorted.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-muted py-4">
                    No members found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <MemberEditorModal
          member={editing}
          show={true}
          onClose={() => setEditingRollNo(null)}
          onSave={handleSave}
          editorRole={me?.role === "superadmin" ? "superadmin" : "admin"}
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
