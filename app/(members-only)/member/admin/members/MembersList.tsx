// app/(members-only)/member/admin/members/MembersList.tsx
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
                  className="btn btn-sm btn-outline-primary"
                  onClick={() => setEditingRollNo(m.rollNo)}
                >
                  Edit
                </button>
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
    </>
  );
}
