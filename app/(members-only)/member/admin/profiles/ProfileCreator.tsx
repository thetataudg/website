// app/(members-only)/member/admin/profiles/ProfileCreator.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import MemberEditorModal, { MemberData } from "../members/MemberEditorModal";
import CreateProfileModal from "./CreateProfileModal";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";

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
  const [meRole, setMeRole] = useState<"superadmin" | "admin">("admin");
  const [query, setQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [statusFilter, setStatusFilter] = useState<
    "All" | "Active" | "Alumni" | "Removed" | "Deceased"
  >("All");

  useEffect(() => {
    fetch("/api/members/me")
      .then((r) => r.json())
      .then((d) => setMeRole(d.role === "superadmin" ? "superadmin" : "admin"))
      .catch(() => setMeRole("admin"));
  }, []);

  const placeholderMembers = useMemo(() => {
    const base = members.filter((m) => !m.clerkId);
    return base
      .filter((m) =>
        statusFilter === "All" ? true : (m.status || "Unknown") === statusFilter
      )
      .filter((m) => {
        if (!query.trim()) return true;
        const haystack = `${m.rollNo} ${m.fName} ${m.lName} ${m.status ?? ""}`.toLowerCase();
        return haystack.includes(query.trim().toLowerCase());
      });
  }, [members, statusFilter, query]);

  const editing = editingRollNo
    ? members.find((m) => m.rollNo === editingRollNo) || null
    : null;

  const handleCreated = (member: MemberData) => {
    setMembers((prev) => {
      const exists = prev.some((m) => m.rollNo === member.rollNo);
      return exists ? prev.map((m) => (m.rollNo === member.rollNo ? member : m)) : [...prev, member];
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
      <section className="bento-card admin-table-card">
        <div className="admin-members-header">
          <div>
            <h2>Create Profiles</h2>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowCreateWarning(true)}
          >
            Create Profile
          </button>
        </div>
      </section>

      <section className="bento-card admin-table-card mt-4">
        <div className="admin-members-header">
          <div>
            <h3>Profiles Without Accounts</h3>
          </div>
          <div className="admin-search-controls">
            <select
              className="form-select admin-search__select"
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(
                  e.target.value as "All" | "Active" | "Alumni" | "Removed" | "Deceased"
                )
              }
            >
              <option value="All">All statuses</option>
              <option value="Active">Active</option>
              <option value="Alumni">Alumni</option>
              <option value="Removed">Removed</option>
              <option value="Deceased">Deceased</option>
            </select>
            <button
              type="button"
              className="brothers-search__toggle"
              aria-label="Open search"
              onClick={() => setShowSearch((v) => !v)}
            >
              <FontAwesomeIcon icon={faMagnifyingGlass} />
            </button>
            <div className={`brothers-search${showSearch ? " is-open" : ""}`}>
              <input
                className="form-control admin-search__input"
                placeholder="Search members..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button
                  type="button"
                  className="brothers-search__clear"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>
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
              {placeholderMembers.map((m) => (
                <tr key={m._id}>
                  <td>#{m.rollNo}</td>
                  <td>
                    {m.fName} {m.lName}
                  </td>
                  <td>
                    {m.status || "Unknown"}
                    {m.isHidden && (
                      <span className="badge bg-secondary ms-2">Hidden</span>
                    )}
                  </td>
                  <td className="text-end">
                    <button
                      className="btn btn-sm btn-outline-primary"
                      onClick={() => setEditingRollNo(m.rollNo)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn btn-sm btn-outline-danger ms-2"
                      onClick={() => setDeletingRollNo(m.rollNo)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {placeholderMembers.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-muted py-4">
                    No placeholder profiles yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {editing && (
        <MemberEditorModal
          member={editing}
          show={true}
          onClose={() => setEditingRollNo(null)}
          onSave={handleSave}
          editorRole={meRole}
        />
      )}
      {showCreateModal && (
        <CreateProfileModal
          show={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreated={handleCreated}
        />
      )}

      {showCreateWarning && (
        <div
          className="modal fade show"
          style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header warning-modal__header">
                <h5 className="modal-title">Filler Profile Notice</h5>
                <button
                  className="btn-close"
                  onClick={() => setShowCreateWarning(false)}
                />
              </div>
              <div className="modal-body">
                <p className="mb-0">
                  These are filler profiles only and cannot be accessed by the
                  member. If you want them to log in, invite them from the Invite
                  Member tab.
                </p>
              </div>
              <div className="modal-footer">
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowCreateWarning(false)}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setShowCreateWarning(false);
                    setShowCreateModal(true);
                  }}
                >
                  I understand
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
