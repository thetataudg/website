// app/member/onboard/OnboardForm.tsx
"use client";

import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";

type Alert = { type: "success" | "danger"; message: string } | null;

export default function OnboardForm({
  invitedEmail,
}: {
  invitedEmail: string;
}) {
  const { user, isLoaded } = useUser();

  const [form, setForm] = useState({
    rollNo: "",
    majors: "",
    gradYear: "",
    hometown: "",
    bio: "",
    github: "",
    linkedin: "",
  });

  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState<Alert>(null);
  const [showModal, setShowModal] = useState(false);

  const upd = <K extends keyof typeof form>(k: K, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setAlert(null);

    const payload = {
      rollNo: form.rollNo.trim(),
      majors: form.majors
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      gradYear: Number(form.gradYear),
      hometown: form.hometown.trim(),
      bio: form.bio.trim(),
      socialLinks: {
        github: form.github.trim(),
        linkedin: form.linkedin.trim(),
      },
    };

    const res = await fetch("/api/members/onboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      setShowModal(true);
    } else {
      const { error } = await res.json().catch(() => ({}));
      setAlert({ type: "danger", message: error || "Something went wrong" });
    }
    setSaving(false);
  }

  useEffect(() => {
    import("bootstrap/dist/js/bootstrap.bundle.min.js").catch(() => {});
  }, []);

  if (!isLoaded) return null;

  const userEmail = user?.primaryEmailAddress?.emailAddress ?? "";
  const fName = user?.firstName ?? "";
  const lName = user?.lastName ?? "";

  return (
    <div className="container py-5">
      <h1 className="mb-4">Welcome, {fName}</h1>

      <form onSubmit={submit} className="card p-4 shadow-sm">
        {/* ── Read-only Clerk fields ─────────────────────────────── */}
        <div className="mb-3 row">
          <label className="col-sm-2 col-form-label">First&nbsp;Name</label>
          <div className="col-sm-10">
            <input className="form-control-plaintext" readOnly value={fName} />
          </div>
        </div>

        <div className="mb-3 row">
          <label className="col-sm-2 col-form-label">Last&nbsp;Name</label>
          <div className="col-sm-10">
            <input className="form-control-plaintext" readOnly value={lName} />
          </div>
        </div>

        <div className="mb-3 row">
          <label className="col-sm-2 col-form-label">E-mail</label>
          <div className="col-sm-10">
            <input
              className="form-control-plaintext"
              readOnly
              value={invitedEmail}
            />
          </div>
        </div>

        <div className="mb-3">
          <label className="form-label">Roll&nbsp;Number</label>
          <input
            className="form-control"
            value={form.rollNo}
            onChange={(e) => upd("rollNo", e.target.value)}
            required
          />
        </div>

        <div className="mb-3">
          <label className="form-label">Major(s) (comma-separated)</label>
          <input
            className="form-control"
            value={form.majors}
            onChange={(e) => upd("majors", e.target.value)}
          />
        </div>

        <div className="mb-3">
          <label className="form-label">Graduation&nbsp;Year</label>
          <input
            type="number"
            className="form-control"
            value={form.gradYear}
            onChange={(e) => upd("gradYear", e.target.value)}
          />
        </div>

        <div className="mb-3">
          <label className="form-label">Hometown</label>
          <input
            className="form-control"
            value={form.hometown}
            onChange={(e) => upd("hometown", e.target.value)}
          />
        </div>

        <div className="mb-3">
          <label className="form-label">Short&nbsp;Bio</label>
          <textarea
            rows={3}
            className="form-control"
            value={form.bio}
            onChange={(e) => upd("bio", e.target.value)}
          />
        </div>

        {/* ── Social links (optional) ───────────────────────────── */}
        <div className="row">
          <div className="col-md-6 mb-3">
            <label className="form-label">GitHub&nbsp;URL</label>
            <input
              className="form-control"
              value={form.github}
              onChange={(e) => upd("github", e.target.value)}
              placeholder="https://github.com/username"
            />
          </div>

          <div className="col-md-6 mb-3">
            <label className="form-label">LinkedIn&nbsp;URL</label>
            <input
              className="form-control"
              value={form.linkedin}
              onChange={(e) => upd("linkedin", e.target.value)}
              placeholder="https://linkedin.com/in/username"
            />
          </div>
        </div>

        {alert && (
          <div className={`alert alert-${alert.type}`} role="alert">
            {alert.message}
          </div>
        )}

        <button className="btn btn-primary" disabled={saving}>
          {saving ? "Submitting…" : "Submit Profile"}
        </button>
      </form>

      {showModal && (
        <div
          className="modal fade show"
          tabIndex={-1}
          style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Profile submitted!</h5>
              </div>
              <div className="modal-body">
                <p>
                  Thanks for completing your profile. An officer will review it
                  shortly - once approved you’ll have access to member tools.
                </p>
              </div>
              <div className="modal-footer">
                <a href="/" className="btn btn-primary">
                  Done
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
