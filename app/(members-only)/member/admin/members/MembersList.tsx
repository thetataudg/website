// // app/(members-only)/member/admin/members/MembersList.tsx

"use client";

import React, { useState, useEffect } from "react";
import MemberEditorModal from "./MemberEditorModal";
import QuickToolsModal from "./QuickToolsModal";

import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faKey,
  faGavel,
  faCheck,
  faTimes,
  faTriangleExclamation,
  faMagnifyingGlass,
} from "@fortawesome/free-solid-svg-icons";
import LoadingState, { LoadingSpinner } from "../../../components/LoadingState";

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
  const [showQuickTools, setShowQuickTools] = useState(false);
  const [quickToolsTool, setQuickToolsTool] = useState<"election" | "graduations">("election");
  const [query, setQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [statusFilter, setStatusFilter] = useState<
    "All" | "Active" | "Alumni" | "Removed" | "Deceased"
  >("Active");
  const [loadingMembers, setLoadingMembers] = useState(true);

  async function refreshMembers() {
    setLoadingMembers(true);
    fetch("/api/members")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: MemberData[]) => setMembers(data))
      .catch(() => setMembers(initialMembers))
      .finally(() => setLoadingMembers(false));
  }

  useEffect(() => {
    fetch("/api/members/me")
      .then((r) => r.json())
      .then((d) => setMe({ role: d.role, rollNo: d.rollNo }))
      .catch(() => setMe(null));
    refreshMembers();
  }, []);

  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return <LoadingState message="Loading members..." />;
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
  const filtered = visible
    .filter((m) =>
      statusFilter === "All" ? true : (m.status || "Unknown") === statusFilter
    )
    .filter((m) => {
      if (!query.trim()) return true;
      const haystack = `${m.rollNo} ${m.fName} ${m.lName} ${m.status ?? ""}`.toLowerCase();
      return haystack.includes(query.trim().toLowerCase());
    });
  const sorted = [...filtered].sort((a, b) => {
    const aNum = Number(String(a.rollNo).replace(/\D/g, "")) || 0;
    const bNum = Number(String(b.rollNo).replace(/\D/g, "")) || 0;
    // Active: ascending, Alumni/All/others: descending
    if (statusFilter === "Active") {
      return aNum - bNum;
    } else {
      return bNum - aNum;
    }
  });

  const editing = editingRollNo
    ? members.find((m) => m.rollNo === editingRollNo) || null
    : null;

  async function handleSave(updates: Partial<MemberData>) {
    if (!editing) return;
    const res = await fetch(`/api/members/${editing.rollNo}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const { error } = await res.json();
      alert(`Failed to update member: ${error}`);
      return;
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
      <div className="bento-card admin-table-card mb-3">
        <div className="d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-3">
          <div>
            <h2 className="mb-1">Quick Tools</h2>
            <p className="text-muted mb-0">
              Run bulk chapter updates from one place.
            </p>
          </div>
          <div className="d-flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-outline-primary"
              disabled={me?.role !== "admin" && me?.role !== "superadmin"}
              title={me?.role !== "admin" && me?.role !== "superadmin" ? "Admin only" : undefined}
              onClick={() => {
                setQuickToolsTool("election");
                setShowQuickTools(true);
              }}
            >
              E-Council Election
            </button>
            <button
              type="button"
              className="btn btn-outline-primary"
              onClick={() => {
                setQuickToolsTool("graduations");
                setShowQuickTools(true);
              }}
            >
              Graduations
            </button>
          </div>
        </div>
      </div>

      <div className="bento-card admin-table-card">
        <div className="admin-members-header">
          <h2>Manage Members</h2>
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
              {loadingMembers ? (
                <tr>
                  <td colSpan={4} className="text-center py-5">
                    <LoadingSpinner size="sm" className="me-2" />
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
                    {m.isHidden && (
                      <span className="badge bg-secondary ms-2">Hidden</span>
                    )}
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

      <QuickToolsModal
        show={showQuickTools}
        initialTool={quickToolsTool}
        members={members}
        canManageElection={me?.role === "admin" || me?.role === "superadmin"}
        onClose={() => setShowQuickTools(false)}
        onCompleted={refreshMembers}
      />

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
                  {deleteLoading && <LoadingSpinner size="sm" className="me-2" />}
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
