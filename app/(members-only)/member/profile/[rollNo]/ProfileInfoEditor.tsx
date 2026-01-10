// app/(members-only)/member/profile/[rollNo]/ProfileInfoEditor.tsx
"use client";

import { useState } from "react";
import type { MemberDoc } from "@/types/member";
import { LoadingSpinner } from "../../../components/LoadingState";

export default function ProfileInfoEditor({
  member,
  onDone,
}: {
  member: MemberDoc;
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    majors: member.majors.join(", "),
    gradYear: member.gradYear.toString(),
    bio: member.bio,
    hometown: member.hometown,
    github: member.socialLinks?.github || "",
    linkedin: member.socialLinks?.linkedin || "",
  });
  const [loading, setLoading] = useState(false);

  const updateField = <K extends keyof typeof form>(key: K, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const payload = {
      majors: form.majors
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      gradYear: Number(form.gradYear),
      bio: form.bio,
      hometown: form.hometown,
      socialLinks: {
        github: form.github.trim(),
        linkedin: form.linkedin.trim(),
      },
    };

    try {
      const res = await fetch("/api/members/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Save failed");
      onDone();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="mb-5 p-4 bg-light rounded shadow-sm">
      {/* Majors & Graduation Year */}
      <div className="row mb-3">
        <div className="col-sm-6">
          <label className="form-label">Majors (comma-separated)</label>
          <input
            className="form-control"
            value={form.majors}
            onChange={(e) => updateField("majors", e.target.value)}
          />
        </div>
        <div className="col-sm-6">
          <label className="form-label">Graduation Year</label>
          <input
            type="number"
            className="form-control"
            value={form.gradYear}
            onChange={(e) => updateField("gradYear", e.target.value)}
          />
        </div>
      </div>

      {/* Bio */}
      <div className="mb-3">
        <label className="form-label">Bio</label>
        <textarea
          className="form-control"
          rows={3}
          value={form.bio}
          onChange={(e) => updateField("bio", e.target.value)}
        />
      </div>

      {/* Hometown */}
      <div className="mb-3">
        <label className="form-label">Hometown</label>
        <input
          className="form-control"
          value={form.hometown}
          onChange={(e) => updateField("hometown", e.target.value)}
        />
      </div>

      {/* Social Links */}
      <div className="row mb-3">
        <div className="col-sm-6">
          <label className="form-label">GitHub URL</label>
          <input
            className="form-control"
            value={form.github}
            onChange={(e) => updateField("github", e.target.value)}
            placeholder="https://github.com/username"
          />
        </div>
        <div className="col-sm-6">
          <label className="form-label">LinkedIn URL</label>
          <input
            className="form-control"
            value={form.linkedin}
            onChange={(e) => updateField("linkedin", e.target.value)}
            placeholder="https://linkedin.com/in/username"
          />
        </div>
      </div>

      {/* Save Button */}
      <button className="btn btn-primary" disabled={loading}>
        {loading ? (
          <>
            <LoadingSpinner size="sm" className="me-2" />
            Saving...
          </>
        ) : (
          "Save Info"
        )}
      </button>
    </form>
  );
}
