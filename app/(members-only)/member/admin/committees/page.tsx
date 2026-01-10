"use client";

import { useEffect, useMemo, useState } from "react";
import LoadingState, { LoadingSpinner } from "../../../components/LoadingState";

type Member = {
  _id: string;
  fName: string;
  lName: string;
  rollNo: string;
  status?: string;
};

type Committee = {
  _id: string;
  name: string;
  description?: string;
  committeeHeadId?: string | { _id?: string; fName?: string; lName?: string };
  committeeMembers?: (string | { _id?: string; fName?: string; lName?: string })[];
};

export default function CommitteesPage() {
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  const [form, setForm] = useState({
    name: "",
    description: "",
    committeeHeadId: "",
    committeeMembers: [] as string[],
  });

  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    committeeHeadId: "",
    committeeMembers: [] as string[],
  });

  const activeMembers = useMemo(
    () => members.filter((m) => m.status === "Active"),
    [members]
  );

  useEffect(() => {
    async function load() {
      const [commRes, memRes] = await Promise.all([
        fetch("/api/committees"),
        fetch("/api/members"),
      ]);
      const commData = commRes.ok ? await commRes.json() : [];
      const memData = memRes.ok ? await memRes.json() : [];
      setCommittees(commData);
      setMembers(memData);
      setLoading(false);
    }
    load();
  }, []);

  function resetForm() {
    setForm({
      name: "",
      description: "",
      committeeHeadId: "",
      committeeMembers: [],
    });
  }

  function startEdit(committee: Committee) {
    const headId =
      typeof committee.committeeHeadId === "string"
        ? committee.committeeHeadId
        : committee.committeeHeadId?._id || "";
    const memberIds =
      committee.committeeMembers?.map((m: any) => {
        if (typeof m === "string") return m;
        if (m && typeof m === "object") {
          if (m._id) return m._id;
          if (typeof m.toString === "function") return m.toString();
        }
        return "";
      }) || [];
    setEditForm({
      name: committee.name,
      description: committee.description || "",
      committeeHeadId: headId,
      committeeMembers: memberIds.filter(Boolean),
    });
    setEditingId(committee._id);
    setShowEdit(true);
  }

  async function saveCommittee(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      committeeHeadId: form.committeeHeadId || null,
      committeeMembers: form.committeeMembers.filter(
        (id) => id !== form.committeeHeadId
      ),
    };

    const res = await fetch("/api/committees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const created = await res.json();
      setCommittees((prev) => [created, ...prev]);
      resetForm();
      setShowCreate(false);
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    const payload = {
      name: editForm.name.trim(),
      description: editForm.description.trim(),
      committeeHeadId: editForm.committeeHeadId || null,
      committeeMembers: editForm.committeeMembers.filter(
        (id) => id !== editForm.committeeHeadId
      ),
    };
    const res = await fetch(`/api/committees/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const updated = await res.json();
      setCommittees((prev) =>
        prev.map((c) => (c._id === editingId ? updated : c))
      );
      setEditingId(null);
      setShowEdit(false);
      setEditForm({
        name: "",
        description: "",
        committeeHeadId: "",
        committeeMembers: [],
      });
    }
  }

  async function confirmDelete() {
    if (!deleteId) return;
    const res = await fetch(`/api/committees/${deleteId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setCommittees((prev) => prev.filter((c) => c._id !== deleteId));
      setDeleteId(null);
      if (editingId === deleteId) {
        setEditingId(null);
        setShowEdit(false);
        setEditForm({
          name: "",
          description: "",
          committeeHeadId: "",
          committeeMembers: [],
        });
      }
    }
  }

  if (loading) {
    return <LoadingState message="Loading committees..." />;
  }

  return (
    <div>
      <div className="bento-card admin-table-card">
        <div className="admin-members-header">
          <h2>Manage Committees</h2>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            Add Committee
          </button>
        </div>

        <div className="table-responsive">
          <table className="table admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Head</th>
                <th>Members</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {committees.map((c) => {
                const headName =
                  typeof c.committeeHeadId === "string"
                    ? activeMembers.find((m) => m._id === c.committeeHeadId)
                    : c.committeeHeadId;
                const headLabel =
                  headName && typeof headName !== "string"
                    ? `${headName.fName || ""} ${headName.lName || ""}`.trim()
                    : "Unassigned";
                return (
                  <tr key={c._id}>
                    <td>{c.name}</td>
                    <td>{headLabel || "Unassigned"}</td>
                    <td>{c.committeeMembers?.length || 0}</td>
                    <td className="text-end">
                      <button
                        className="btn btn-sm btn-outline-primary me-2"
                        onClick={() => startEdit(c)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-sm btn-outline-danger"
                        onClick={() => setDeleteId(c._id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
              {committees.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-muted">
                    No committees yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {deleteId && (
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
                  onClick={() => setDeleteId(null)}
                ></button>
              </div>
              <div className="modal-body">
                <p>Are you sure you want to delete this committee?</p>
              </div>
              <div className="modal-footer">
                <button
                  className="btn btn-secondary"
                  onClick={() => setDeleteId(null)}
                >
                  Cancel
                </button>
                <button className="btn btn-danger" onClick={confirmDelete}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <div
          className="modal fade show"
          style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="modal-dialog modal-lg modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Create Committee</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowCreate(false)}
                />
              </div>
              <div className="modal-body">
                <form onSubmit={saveCommittee} className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label">Committee Name</label>
                    <input
                      className="form-control"
                      value={form.name}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, name: e.target.value }))
                      }
                      required
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Committee Head</label>
                    <SingleMemberPicker
                      members={activeMembers}
                      value={form.committeeHeadId}
                      onChange={(id) =>
                        setForm((f) => ({
                          ...f,
                          committeeHeadId: id,
                          committeeMembers: f.committeeMembers.filter(
                            (memberId) => memberId !== id
                          ),
                        }))
                      }
                      placeholder="Search and select a head"
                    />
                  </div>
                  <div className="col-12">
                    <label className="form-label">Description</label>
                    <textarea
                      className="form-control"
                      rows={2}
                      value={form.description}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, description: e.target.value }))
                      }
                    />
                  </div>
                  <div className="col-12">
                    <label className="form-label">Committee Members</label>
                    <MemberPicker
                      members={activeMembers}
                      value={form.committeeMembers}
                      onChange={(ids) =>
                        setForm((f) => ({
                          ...f,
                          committeeMembers: ids.filter(
                            (id) => id !== f.committeeHeadId
                          ),
                        }))
                      }
                      disabledIds={form.committeeHeadId ? [form.committeeHeadId] : []}
                    />
                  </div>
                  <div className="col-12 d-flex gap-2">
                    <button className="btn btn-primary" disabled={loading}>
                      {loading && <LoadingSpinner size="sm" className="me-2" />}
                      Create Committee
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={() => {
                        resetForm();
                        setShowCreate(false);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {showEdit && (
        <div
          className="modal fade show"
          style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="modal-dialog modal-lg modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Edit Committee</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => {
                    setShowEdit(false);
                    setEditingId(null);
                    setEditForm({
                      name: "",
                      description: "",
                      committeeHeadId: "",
                      committeeMembers: [],
                    });
                  }}
                />
              </div>
              <div className="modal-body">
                <form onSubmit={saveEdit} className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label">Committee Name</label>
                    <input
                      className="form-control"
                      value={editForm.name}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, name: e.target.value }))
                      }
                      required
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Committee Head</label>
                    <SingleMemberPicker
                      members={activeMembers}
                      value={editForm.committeeHeadId}
                      onChange={(id) =>
                        setEditForm((f) => ({
                          ...f,
                          committeeHeadId: id,
                          committeeMembers: f.committeeMembers.filter(
                            (memberId) => memberId !== id
                          ),
                        }))
                      }
                      placeholder="Search and select a head"
                    />
                  </div>
                  <div className="col-12">
                    <label className="form-label">Description</label>
                    <textarea
                      className="form-control"
                      rows={2}
                      value={editForm.description}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, description: e.target.value }))
                      }
                    />
                  </div>
                  <div className="col-12">
                    <label className="form-label">Committee Members</label>
                    <MemberPicker
                      members={activeMembers}
                      value={editForm.committeeMembers}
                      onChange={(ids) =>
                        setEditForm((f) => ({
                          ...f,
                          committeeMembers: ids.filter(
                            (id) => id !== f.committeeHeadId
                          ),
                        }))
                      }
                      disabledIds={
                        editForm.committeeHeadId
                          ? [editForm.committeeHeadId]
                          : []
                      }
                    />
                  </div>
                  <div className="col-12 d-flex gap-2">
                    <button className="btn btn-primary" disabled={loading}>
                      {loading && <LoadingSpinner size="sm" className="me-2" />}
                      Save Changes
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={() => {
                        setShowEdit(false);
                        setEditingId(null);
                        setEditForm({
                          name: "",
                          description: "",
                          committeeHeadId: "",
                          committeeMembers: [],
                        });
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SingleMemberPicker({
  members,
  value,
  onChange,
  placeholder = "Search for a member",
}: {
  members: Member[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const selectedMember = members.find((m) => m._id === value) || null;
  const matches = members.filter((m) => {
    const label = `${m.fName} ${m.lName} ${m.rollNo}`.toLowerCase();
    return query && label.includes(query.toLowerCase());
  });

  const selectedLabel = selectedMember
    ? `${selectedMember.fName} ${selectedMember.lName} (#${selectedMember.rollNo})`
    : "";

  function chooseMember(id: string) {
    onChange(id);
    setQuery("");
    setShowSuggestions(false);
    setHighlightedIndex(0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((idx) =>
        Math.min(idx + 1, Math.max(matches.length - 1, 0))
      );
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((idx) => Math.max(idx - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (matches.length > 0) {
        const target = matches[highlightedIndex] || matches[0];
        chooseMember(target._id);
      }
    }
  }

  return (
    <div>
      <div className="single-member-input">
        <input
          className="form-control"
          placeholder={placeholder}
          value={query || selectedLabel}
          onChange={(e) => {
            const nextValue = e.target.value;
            if (selectedMember) {
              onChange("");
            }
            setQuery(nextValue);
            setShowSuggestions(true);
            setHighlightedIndex(0);
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          onFocus={() => {
            if (selectedMember) {
              setQuery("");
            }
            if (query) setShowSuggestions(true);
          }}
        />
        {selectedMember && !query && (
          <button
            type="button"
            className="single-member-input__clear"
            onClick={() => onChange("")}
            aria-label="Clear committee head"
          >
            ×
          </button>
        )}
      </div>
      {showSuggestions && matches.length > 0 && (
        <div className="list-group mt-2">
          {matches.slice(0, 6).map((m, index) => (
            <button
              type="button"
              key={m._id}
              className={`list-group-item list-group-item-action ${
                index === highlightedIndex ? "active" : ""
              }`}
              onClick={() => chooseMember(m._id)}
            >
              {m.fName} {m.lName} (#{m.rollNo})
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MemberPicker({
  members,
  value,
  onChange,
  disabledIds = [],
}: {
  members: Member[];
  value: string[];
  onChange: (ids: string[]) => void;
  disabledIds?: string[];
}) {
  const [query, setQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const matches = members
    .filter((m) => !disabledIds.includes(m._id))
    .filter((m) => {
      const label = `${m.fName} ${m.lName} ${m.rollNo}`.toLowerCase();
      return query && label.includes(query.toLowerCase());
    });

  const selectedMembers = value
    .map((id) => members.find((m) => m._id === id))
    .filter(Boolean) as Member[];

  function addMember(id: string) {
    if (value.includes(id)) return;
    onChange([...value, id]);
    setQuery("");
    setShowSuggestions(false);
    setHighlightedIndex(0);
  }

  function removeMember(id: string) {
    onChange(value.filter((v) => v !== id));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((idx) =>
        Math.min(idx + 1, Math.max(matches.length - 1, 0))
      );
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((idx) => Math.max(idx - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (matches.length > 0) {
        const target = matches[highlightedIndex] || matches[0];
        addMember(target._id);
      }
    }
  }

  return (
    <div>
      <input
        className="form-control"
        placeholder="Type a name or roll number and press Enter"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setShowSuggestions(true);
          setHighlightedIndex(0);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
        onFocus={() => query && setShowSuggestions(true)}
      />
      {showSuggestions && matches.length > 0 && (
        <div className="list-group mt-2">
          {matches.slice(0, 6).map((m, index) => (
            <button
              type="button"
              key={m._id}
              className={`list-group-item list-group-item-action ${
                index === highlightedIndex ? "active" : ""
              }`}
              onClick={() => addMember(m._id)}
            >
              {m.fName} {m.lName} (#{m.rollNo})
            </button>
          ))}
        </div>
      )}
      <div className="d-flex flex-wrap gap-2 mt-2">
        {selectedMembers.map((m) => (
          <span key={m._id} className="badge bg-secondary">
            {m.fName} {m.lName}
            <button
              type="button"
              className="btn btn-sm btn-link text-white ms-2 p-0"
              onClick={() => removeMember(m._id)}
            >
              ×
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
