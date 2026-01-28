// app/(members-only)/member/admin/pending/PendingList.tsx
"use client";

 import { useState } from "react";

interface PendingRequest {
  _id: string;
  clerkId: string;
  rollNo: string;
  fName: string;
  lName: string;
  headline?: string;
  pronouns?: string;
  majors?: string[];
  minors?: string[];
  status: "pending" | "approved" | "rejected";
  submittedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewComments?: string;
  gradYear?: number;
  bio?: string;
  pledgeClass?: string;
  hometown?: string;
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
  socialLinks?: Record<string, string>;
  preferredStatus?: "Active" | "Alumni" | "Removed" | "Deceased";
  preferredRole?: "superadmin" | "admin" | "member";
}

interface Props {
  initialRequests: PendingRequest[];
}

export default function PendingList({ initialRequests }: Props) {
  const [requests, setRequests] = useState<PendingRequest[]>(initialRequests);
  const [selected, setSelected] = useState<PendingRequest | null>(null);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    rollNo: "",
    fName: "",
    lName: "",
    headline: "",
    pronouns: "",
    majors: "",
    minors: "",
    gradYear: "",
    pledgeClass: "",
    hometown: "",
    bio: "",
    skills: "",
    funFacts: "",
    github: "",
    linkedin: "",
    instagram: "",
    website: "",
    projects: [] as Array<{ title: string; description: string; link: string }>,
    work: [] as Array<{
      title: string;
      organization: string;
      start: string;
      end: string;
      description: string;
      link: string;
    }>,
    awards: [] as Array<{ title: string; issuer: string; date: string; description: string }>,
    customSections: [] as Array<{ title: string; body: string }>,
    preferredStatus: "Active",
    preferredRole: "member",
  });

  const pledgeClassOptions = [
    "Zeta Gamma",
    "Eta Gamma",
    "Theta Gamma",
    "Iota Gamma",
    "Kappa Gamma",
    "Lambda Gamma",
    "Mu Gamma",
    "Nu Gamma",
    "Xi Gamma",
    "Omicron Gamma",
    "Pi Gamma",
    "Rho Gamma",
    "Sigma Gamma",
    "Tau Gamma",
    "Upsilon Gamma",
    "Phi Gamma",
    "Chi Gamma",
    "Psi Gamma",
    "Omega Gamma",
  ];

  const preferredStatusOptions = [
    "Active",
    "Alumni",
    "Removed",
    "Deceased",
  ];

  const preferredRoleOptions = ["member", "admin", "superadmin"];

  const parseList = (text: string) =>
    text
      .split(/\n|,/)
      .map((s) => s.trim())
      .filter(Boolean);

  const updateField = <K extends keyof typeof form>(key: K, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const updateArrayItem = <T, K extends keyof T>(
    key: "projects" | "work" | "awards" | "customSections",
    index: number,
    field: K,
    value: string
  ) =>
    setForm((f) => {
      const copy = [...(f[key] as T[])];
      copy[index] = { ...copy[index], [field]: value };
      return { ...f, [key]: copy };
    });

  const addArrayItem = (
    key: "projects" | "work" | "awards" | "customSections"
  ) =>
    setForm((f) => {
      const empty =
        key === "projects"
          ? { title: "", description: "", link: "" }
          : key === "work"
          ? {
              title: "",
              organization: "",
              start: "",
              end: "",
              description: "",
              link: "",
            }
          : key === "awards"
          ? { title: "", issuer: "", date: "", description: "" }
          : { title: "", body: "" };
      return { ...f, [key]: [...(f[key] as any[]), empty] };
    });

  const removeArrayItem = (
    key: "projects" | "work" | "awards" | "customSections",
    index: number
  ) =>
    setForm((f) => {
      const copy = [...(f[key] as any[])];
      copy.splice(index, 1);
      return { ...f, [key]: copy };
    });

  const openModal = (request: PendingRequest) => {
    setSelected(request);
    setError(null);
    const socials = request.socialLinks || {};
    setForm({
      rollNo: request.rollNo || "",
      fName: request.fName || "",
      lName: request.lName || "",
      headline: request.headline || "",
      pronouns: request.pronouns || "",
      majors: (request.majors || []).join(", "),
      minors: (request.minors || []).join(", "),
      gradYear: request.gradYear ? String(request.gradYear) : "",
      pledgeClass: request.pledgeClass || "",
      hometown: request.hometown || "",
      bio: request.bio || "",
      skills: (request.skills || []).join("\n"),
      funFacts: (request.funFacts || []).join("\n"),
      github: socials.github || "",
      linkedin: socials.linkedin || "",
      instagram: socials.instagram || "",
      website: socials.website || "",
      projects: (request.projects || []).map((p) => ({
        title: p.title || "",
        description: p.description || "",
        link: p.link || "",
      })),
      work: (request.work || []).map((w) => ({
        title: w.title || "",
        organization: w.organization || "",
        start: w.start || "",
        end: w.end || "",
        description: w.description || "",
        link: w.link || "",
      })),
      awards: (request.awards || []).map((a) => ({
        title: a.title || "",
        issuer: a.issuer || "",
        date: a.date || "",
        description: a.description || "",
      })),
      customSections: (request.customSections || []).map((s) => ({
        title: s.title || "",
        body: s.body || "",
      })),
      preferredStatus: request.preferredStatus || "Active",
      preferredRole: request.preferredRole || "member",
    });
  };

  async function review(id: string, action: "approve" | "reject") {
    const res = await fetch(`/api/members/pending/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) {
      console.error("Failed to review:", await res.text());
      return;
    }
    setRequests((rs) => rs.filter((r) => r._id !== id));
  }

  const buildUpdates = () => {
    const gradYear = Number(form.gradYear);
    return {
      rollNo: form.rollNo.trim(),
      fName: form.fName.trim(),
      lName: form.lName.trim(),
      headline: form.headline.trim(),
      pronouns: form.pronouns.trim(),
      majors: parseList(form.majors),
      minors: parseList(form.minors),
      gradYear: Number.isFinite(gradYear) && gradYear ? gradYear : undefined,
      pledgeClass: form.pledgeClass.trim(),
      hometown: form.hometown.trim(),
      bio: form.bio,
      skills: parseList(form.skills),
      funFacts: parseList(form.funFacts),
      projects: form.projects,
      work: form.work,
      awards: form.awards,
      customSections: form.customSections,
      socialLinks: {
        github: form.github.trim(),
        linkedin: form.linkedin.trim(),
        instagram: form.instagram.trim(),
        website: form.website.trim(),
      },
      preferredStatus: form.preferredStatus,
      preferredRole: form.preferredRole,
    };
  };

  const saveUpdates = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/members/pending/${selected._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", updates: buildUpdates() }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error || "Failed to save updates.");
      setSaving(false);
      return;
    }
    const updated = (await res.json()) as PendingRequest;
    setRequests((rs) =>
      rs.map((r) => (r._id === selected._id ? { ...r, ...updated } : r))
    );
    setSelected((prev) => (prev ? { ...prev, ...updated } : prev));
    setSaving(false);
  };

  const approveWithUpdates = async () => {
    if (!selected) return;
    setProcessing(true);
    setError(null);
    const updateRes = await fetch(`/api/members/pending/${selected._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", updates: buildUpdates() }),
    });
    if (!updateRes.ok) {
      const data = await updateRes.json().catch(() => ({}));
      setError(data?.error || "Failed to update before approval.");
      setProcessing(false);
      return;
    }
    await review(selected._id, "approve");
    setSelected(null);
    setProcessing(false);
  };

  const rejectRequest = async () => {
    if (!selected) return;
    setProcessing(true);
    setError(null);
    await review(selected._id, "reject");
    setSelected(null);
    setProcessing(false);
  };

  return (
    <div className="bento-card admin-table-card">
      <div className="admin-members-header">
        <h2>Pending Requests</h2>
      </div>
      <ul className="list-group admin-list">
        {requests.map((r) => (
          <li className="list-group-item" key={r._id}>
            <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
              <div>
                <strong>#{r.rollNo}</strong> — {r.fName} {r.lName}
              </div>
              <div className="d-flex gap-2">
                <button
                  className="btn btn-sm btn-outline-primary"
                  onClick={() => openModal(r)}
                >
                  View
                </button>
              </div>
            </div>
          </li>
        ))}
        {requests.length === 0 && (
          <li className="list-group-item text-center text-muted">
            No pending requests.
          </li>
        )}
      </ul>

      {selected && (
        <div
          className="modal fade show"
          style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="modal-dialog modal-xl modal-dialog-scrollable admin-modal-wide">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  Review #{selected.rollNo} — {selected.fName} {selected.lName}
                </h5>
                <button className="btn-close" onClick={() => setSelected(null)} />
              </div>
              <div className="modal-body">
                {error && <div className="alert alert-danger">{error}</div>}

                <div className="profile-editor__section">
                  <h4 className="mb-3">Basics</h4>
                  <div className="row mb-3">
                    <div className="col-md-4">
                      <label className="form-label">Roll No</label>
                      <input
                        className="form-control"
                        value={form.rollNo}
                        onChange={(e) => updateField("rollNo", e.target.value)}
                      />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label">First Name</label>
                      <input
                        className="form-control"
                        value={form.fName}
                        onChange={(e) => updateField("fName", e.target.value)}
                      />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label">Last Name</label>
                      <input
                        className="form-control"
                        value={form.lName}
                        onChange={(e) => updateField("lName", e.target.value)}
                      />
                    </div>
                  </div>
                </div>
                <div className="profile-editor__section">
                  <h4 className="mb-3">Membership</h4>
                  <div className="row mb-3">
                    <div className="col-sm-6">
                      <label className="form-label">Status</label>
                      <select
                        className="form-select"
                        value={form.preferredStatus}
                        onChange={(e) =>
                          updateField("preferredStatus", e.target.value)
                        }
                      >
                        {preferredStatusOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-sm-6">
                      <label className="form-label">Role</label>
                      <select
                        className="form-select"
                        value={form.preferredRole}
                        onChange={(e) =>
                          updateField("preferredRole", e.target.value)
                        }
                      >
                        {preferredRoleOptions.map((option) => (
                          <option key={option} value={option}>
                            {option.charAt(0).toUpperCase() + option.slice(1)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="profile-editor__section">
                  <h4 className="mb-4">Profile Builder</h4>

                  <div className="row mb-3">
                    <div className="col-md-8">
                      <label className="form-label">Headline / Tagline</label>
                      <input
                        className="form-control"
                        value={form.headline}
                        onChange={(e) => updateField("headline", e.target.value)}
                        placeholder="Aspiring robotics engineer • Project lead"
                      />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label">Pronouns</label>
                      <input
                        className="form-control"
                        value={form.pronouns}
                        onChange={(e) => updateField("pronouns", e.target.value)}
                        placeholder="he/him, she/her, they/them"
                      />
                    </div>
                  </div>

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
                      <label className="form-label">Minors (comma-separated)</label>
                      <input
                        className="form-control"
                        value={form.minors}
                        onChange={(e) => updateField("minors", e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="row mb-3">
                    <div className="col-sm-4">
                      <label className="form-label">Graduation Year</label>
                      <input
                        type="number"
                        className="form-control"
                        value={form.gradYear}
                        onChange={(e) => updateField("gradYear", e.target.value)}
                      />
                    </div>
                    <div className="col-sm-4">
                      <label className="form-label">Pledge Class</label>
                      <select
                        className="form-select"
                        value={form.pledgeClass}
                        onChange={(e) => updateField("pledgeClass", e.target.value)}
                      >
                        <option value="">Select pledge class</option>
                        {pledgeClassOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-sm-4">
                      <label className="form-label">Hometown</label>
                      <input
                        className="form-control"
                        value={form.hometown}
                        onChange={(e) => updateField("hometown", e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="mb-0">
                    <label className="form-label">Bio</label>
                    <textarea
                      className="form-control"
                      rows={4}
                      value={form.bio}
                      onChange={(e) => updateField("bio", e.target.value)}
                      placeholder="Share your story, interests, or what you're working on."
                    />
                  </div>
                </div>

                <div className="profile-editor__section">
                  <h5 className="mb-3">Links & Highlights</h5>

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

                  <div className="row mb-3">
                    <div className="col-sm-6">
                      <label className="form-label">Instagram URL</label>
                      <input
                        className="form-control"
                        value={form.instagram}
                        onChange={(e) => updateField("instagram", e.target.value)}
                        placeholder="https://instagram.com/username"
                      />
                    </div>
                    <div className="col-sm-6">
                      <label className="form-label">Personal Website</label>
                      <input
                        className="form-control"
                        value={form.website}
                        onChange={(e) => updateField("website", e.target.value)}
                        placeholder="https://your-site.com"
                      />
                    </div>
                  </div>

                  <div className="row mb-0">
                    <div className="col-md-6">
                      <label className="form-label">Skills (one per line)</label>
                      <textarea
                        className="form-control"
                        rows={4}
                        value={form.skills}
                        onChange={(e) => updateField("skills", e.target.value)}
                        placeholder="CAD\nPython\nProject Management"
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Fun Facts (one per line)</label>
                      <textarea
                        className="form-control"
                        rows={4}
                        value={form.funFacts}
                        onChange={(e) => updateField("funFacts", e.target.value)}
                        placeholder="Loves sunrise hikes\nCollects vintage cameras"
                      />
                    </div>
                  </div>
                </div>

                <div className="profile-editor__section">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <h5 className="mb-0">Projects</h5>
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm"
                      onClick={() => addArrayItem("projects")}
                    >
                      Add Project
                    </button>
                  </div>
                  {form.projects.map((project, index) => (
                    <div className="border rounded p-3 mb-3" key={`project-${index}`}>
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <strong>Project {index + 1}</strong>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => removeArrayItem("projects", index)}
                        >
                          Remove
                        </button>
                      </div>
                      <div className="row">
                        <div className="col-md-6 mb-2">
                          <input
                            className="form-control"
                            placeholder="Project title"
                            value={project.title}
                            onChange={(e) =>
                              updateArrayItem<typeof project, "title">(
                                "projects",
                                index,
                                "title",
                                e.target.value
                              )
                            }
                          />
                        </div>
                        <div className="col-md-6 mb-2">
                          <input
                            className="form-control"
                            placeholder="Project link"
                            value={project.link}
                            onChange={(e) =>
                              updateArrayItem<typeof project, "link">(
                                "projects",
                                index,
                                "link",
                                e.target.value
                              )
                            }
                          />
                        </div>
                      </div>
                      <textarea
                        className="form-control"
                        rows={3}
                        placeholder="Short description"
                        value={project.description}
                        onChange={(e) =>
                          updateArrayItem<typeof project, "description">(
                            "projects",
                            index,
                            "description",
                            e.target.value
                          )
                        }
                      />
                    </div>
                  ))}
                </div>

                <div className="profile-editor__section">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <h5 className="mb-0">Work / Internships</h5>
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm"
                      onClick={() => addArrayItem("work")}
                    >
                      Add Experience
                    </button>
                  </div>
                  {form.work.map((item, index) => (
                    <div className="border rounded p-3 mb-3" key={`work-${index}`}>
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <strong>Experience {index + 1}</strong>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => removeArrayItem("work", index)}
                        >
                          Remove
                        </button>
                      </div>
                      <div className="row">
                        <div className="col-md-6 mb-2">
                          <input
                            className="form-control"
                            placeholder="Role title"
                            value={item.title}
                            onChange={(e) =>
                              updateArrayItem<typeof item, "title">(
                                "work",
                                index,
                                "title",
                                e.target.value
                              )
                            }
                          />
                        </div>
                        <div className="col-md-6 mb-2">
                          <input
                            className="form-control"
                            placeholder="Organization"
                            value={item.organization}
                            onChange={(e) =>
                              updateArrayItem<typeof item, "organization">(
                                "work",
                                index,
                                "organization",
                                e.target.value
                              )
                            }
                          />
                        </div>
                      </div>
                      <div className="row mb-2">
                        <div className="col-md-4">
                          <input
                            className="form-control"
                            placeholder="Start (e.g. Aug 2023)"
                            value={item.start}
                            onChange={(e) =>
                              updateArrayItem<typeof item, "start">(
                                "work",
                                index,
                                "start",
                                e.target.value
                              )
                            }
                          />
                        </div>
                        <div className="col-md-4">
                          <input
                            className="form-control"
                            placeholder="End (e.g. May 2024)"
                            value={item.end}
                            onChange={(e) =>
                              updateArrayItem<typeof item, "end">(
                                "work",
                                index,
                                "end",
                                e.target.value
                              )
                            }
                          />
                        </div>
                        <div className="col-md-4">
                          <input
                            className="form-control"
                            placeholder="Link"
                            value={item.link}
                            onChange={(e) =>
                              updateArrayItem<typeof item, "link">(
                                "work",
                                index,
                                "link",
                                e.target.value
                              )
                            }
                          />
                        </div>
                      </div>
                      <textarea
                        className="form-control"
                        rows={3}
                        placeholder="Description"
                        value={item.description}
                        onChange={(e) =>
                          updateArrayItem<typeof item, "description">(
                            "work",
                            index,
                            "description",
                            e.target.value
                          )
                        }
                      />
                    </div>
                  ))}
                </div>

                <div className="profile-editor__section">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <h5 className="mb-0">Awards / Certifications</h5>
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm"
                      onClick={() => addArrayItem("awards")}
                    >
                      Add Award
                    </button>
                  </div>
                  {form.awards.map((award, index) => (
                    <div className="border rounded p-3 mb-3" key={`award-${index}`}>
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <strong>Award {index + 1}</strong>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => removeArrayItem("awards", index)}
                        >
                          Remove
                        </button>
                      </div>
                      <div className="row mb-2">
                        <div className="col-md-6">
                          <input
                            className="form-control"
                            placeholder="Title"
                            value={award.title}
                            onChange={(e) =>
                              updateArrayItem<typeof award, "title">(
                                "awards",
                                index,
                                "title",
                                e.target.value
                              )
                            }
                          />
                        </div>
                        <div className="col-md-3">
                          <input
                            className="form-control"
                            placeholder="Issuer"
                            value={award.issuer}
                            onChange={(e) =>
                              updateArrayItem<typeof award, "issuer">(
                                "awards",
                                index,
                                "issuer",
                                e.target.value
                              )
                            }
                          />
                        </div>
                        <div className="col-md-3">
                          <input
                            className="form-control"
                            placeholder="Date"
                            value={award.date}
                            onChange={(e) =>
                              updateArrayItem<typeof award, "date">(
                                "awards",
                                index,
                                "date",
                                e.target.value
                              )
                            }
                          />
                        </div>
                      </div>
                      <textarea
                        className="form-control"
                        rows={2}
                        placeholder="Description"
                        value={award.description}
                        onChange={(e) =>
                          updateArrayItem<typeof award, "description">(
                            "awards",
                            index,
                            "description",
                            e.target.value
                          )
                        }
                      />
                    </div>
                  ))}
                </div>

                <div className="profile-editor__section">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <h5 className="mb-0">Custom Sections</h5>
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm"
                      onClick={() => addArrayItem("customSections")}
                    >
                      Add Section
                    </button>
                  </div>
                  {form.customSections.map((section, index) => (
                    <div className="border rounded p-3 mb-3" key={`section-${index}`}>
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <strong>Section {index + 1}</strong>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => removeArrayItem("customSections", index)}
                        >
                          Remove
                        </button>
                      </div>
                      <input
                        className="form-control mb-2"
                        placeholder="Section title"
                        value={section.title}
                        onChange={(e) =>
                          updateArrayItem<typeof section, "title">(
                            "customSections",
                            index,
                            "title",
                            e.target.value
                          )
                        }
                      />
                      <textarea
                        className="form-control"
                        rows={3}
                        placeholder="Section body"
                        value={section.body}
                        onChange={(e) =>
                          updateArrayItem<typeof section, "body">(
                            "customSections",
                            index,
                            "body",
                            e.target.value
                          )
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div className="modal-footer">
                <button
                  className="btn btn-secondary"
                  onClick={() => setSelected(null)}
                  disabled={processing}
                >
                  Close
                </button>
                <button
                  className="btn btn-outline-primary"
                  onClick={saveUpdates}
                  disabled={saving || processing}
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
                <button
                  className="btn btn-outline-danger"
                  onClick={rejectRequest}
                  disabled={processing}
                >
                  Reject
                </button>
                <button
                  className="btn btn-primary"
                  onClick={approveWithUpdates}
                  disabled={processing}
                >
                  {processing ? "Approving..." : "Approve"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
