// app/(members-only)/member/admin/profiles/CreateProfileModal.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import PhotoUploader from "../../profile/[rollNo]/PhotoUploader";
import ResumeUploader from "../../profile/[rollNo]/ResumeUploader";
import { LoadingSpinner } from "../../../components/LoadingState";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faImage,
  faUpload,
  faEye,
  faEyeSlash,
  faUserTag,
} from "@fortawesome/free-solid-svg-icons";
import type { MemberData } from "../members/MemberEditorModal";

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

const getMemberId = (value: any) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value._id || "";
};

interface Props {
  show: boolean;
  onClose: () => void;
  onCreated: (member: MemberData) => void;
}

export default function CreateProfileModal({ show, onClose, onCreated }: Props) {
  const [form, setForm] = useState({
    rollNo: "",
    fName: "",
    lName: "",
    status: "Alumni",
    isHidden: false,
    isECouncil: false,
    ecouncilPosition: "",
    isCommitteeHead: false,
    familyLine: "",
    big: "",
    little: "",
    headline: "",
    pronouns: "",
    majors: "",
    minors: "",
    gradYear: "",
    bio: "",
    hometown: "",
    pledgeClass: "",
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
  });

  const [allMembers, setAllMembers] = useState<MemberData[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<MemberData | null>(null);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [showResumeModal, setShowResumeModal] = useState(false);

  useEffect(() => {
    if (!show) return;
    setCreated(null);
    setError(null);
    setForm((f) => ({
      ...f,
      rollNo: "",
      fName: "",
      lName: "",
      gradYear: "",
      status: "Alumni",
      isHidden: false,
      isECouncil: false,
      ecouncilPosition: "",
      isCommitteeHead: false,
      familyLine: "",
      big: "",
      little: "",
      headline: "",
      pronouns: "",
      majors: "",
      minors: "",
      bio: "",
      hometown: "",
      pledgeClass: "",
      skills: "",
      funFacts: "",
      github: "",
      linkedin: "",
      instagram: "",
      website: "",
      projects: [],
      work: [],
      awards: [],
      customSections: [],
    }));

    fetch("/api/members")
      .then((r) => r.json())
      .then((list: MemberData[]) => {
        setAllMembers(list.filter((m) => m.role !== "superadmin"));
      })
      .catch(console.error);
  }, [show]);

  const update = <K extends keyof typeof form>(key: K, val: any) =>
    setForm((f) => ({ ...f, [key]: val }));

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

  const parseList = (text: string) =>
    text
      .split(/\n|,/)
      .map((s) => s.trim())
      .filter(Boolean);

  const photoLabel = useMemo(
    () => (created?.profilePicUrl ? "Update Photo" : "Add Photo"),
    [created?.profilePicUrl]
  );
  const resumeLabel = useMemo(
    () => (created?.resumeUrl ? "Update Resume" : "Add Resume"),
    [created?.resumeUrl]
  );

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    const gradYear = Number(form.gradYear);
    if (!form.rollNo.trim() || !form.fName.trim() || !form.lName.trim() || !Number.isFinite(gradYear) || !gradYear) {
      setError("Roll No, first name, last name, and graduation year are required.");
      setSaving(false);
      return;
    }
    const payload = {
      rollNo: form.rollNo.trim(),
      fName: form.fName.trim(),
      lName: form.lName.trim(),
      status: form.status,
      isHidden: form.isHidden,
      isECouncil: form.isECouncil,
      ecouncilPosition: form.isECouncil ? form.ecouncilPosition : "",
      isCommitteeHead: form.isCommitteeHead,
      familyLine: form.familyLine,
      bigs: form.big ? [form.big] : [],
      littles: form.little ? [form.little] : [],
      headline: form.headline.trim(),
      pronouns: form.pronouns.trim(),
      majors: parseList(form.majors),
      minors: parseList(form.minors),
      ...(Number.isFinite(gradYear) && gradYear ? { gradYear } : {}),
      bio: form.bio,
      hometown: form.hometown,
      pledgeClass: form.pledgeClass.trim(),
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
    } as Partial<MemberData> & { rollNo: string; fName: string; lName: string };

    try {
      const endpoint = created
        ? `/api/members/${created.rollNo}`
        : "/api/members";
      const method = created ? "PATCH" : "POST";
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        let message = text;
        try {
          const data = JSON.parse(text);
          message = data?.error || message;
        } catch {
          // keep raw text
        }
        throw new Error(message || "Failed to save profile");
      }

      const saved = (await res.json()) as MemberData;
      setCreated(saved);
      setForm((f) => ({ ...f, rollNo: saved.rollNo }));
      onCreated(saved);
    } catch (err: any) {
      setError(err?.message || "Failed to save profile");
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
      <div className="modal-dialog modal-xl modal-dialog-scrollable admin-modal-wide">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Create Member Profile</h5>
            <button className="btn-close" onClick={onClose} />
          </div>

          {error && <div className="alert alert-danger m-3">{error}</div>}

          <div className="modal-body">
            <div className="row g-4">
              <div className="col-lg-4">
                <div className="border rounded p-3">
                  <h6 className="mb-3 d-flex align-items-center gap-2">
                    <FontAwesomeIcon icon={faUserTag} />
                    Profile Media
                  </h6>
                  <div className="text-center">
                    {created?.profilePicUrl ? (
                      <img
                        src={created.profilePicUrl}
                        alt="Profile"
                        className="rounded-circle mb-3"
                        style={{ width: 120, height: 120, objectFit: "cover" }}
                      />
                    ) : (
                      <div
                        className="rounded-circle bg-light d-inline-flex align-items-center justify-content-center mb-3"
                        style={{ width: 120, height: 120 }}
                      >
                        <FontAwesomeIcon icon={faImage} className="text-muted" />
                      </div>
                    )}
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm w-100"
                      onClick={() => setShowPhotoModal(true)}
                      disabled={!created}
                    >
                      <FontAwesomeIcon icon={faImage} className="me-2" />
                      {photoLabel}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm w-100 mt-2"
                      onClick={() => setShowResumeModal(true)}
                      disabled={!created}
                    >
                      <FontAwesomeIcon icon={faUpload} className="me-2" />
                      {resumeLabel}
                    </button>
                    {!created && (
                      <p className="text-muted mt-2 mb-0" style={{ fontSize: 12 }}>
                        Save the profile first to upload files.
                      </p>
                    )}
                  </div>
                </div>

                <div className="border rounded p-3 mt-3">
                  <h6 className="mb-3">Admin Controls</h6>
                  <div className="mb-3">
                    <label className="form-label">Roll No</label>
                    <input
                      className="form-control"
                      value={form.rollNo}
                      onChange={(e) => update("rollNo", e.target.value)}
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">First Name</label>
                    <input
                      className="form-control"
                      value={form.fName}
                      onChange={(e) => update("fName", e.target.value)}
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Last Name</label>
                    <input
                      className="form-control"
                      value={form.lName}
                      onChange={(e) => update("lName", e.target.value)}
                    />
                  </div>
                  <div className="mb-3">
                    <button
                      type="button"
                      className={`btn btn-sm ${
                        form.isHidden ? "btn-outline-secondary" : "btn-outline-success"
                      }`}
                      aria-pressed={!form.isHidden}
                      onClick={() => update("isHidden", !form.isHidden)}
                    >
                      <FontAwesomeIcon
                        icon={form.isHidden ? faEyeSlash : faEye}
                        className="me-2"
                      />
                      {form.isHidden
                        ? "Hidden from public site"
                        : "Visible on public site"}
                    </button>
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Status</label>
                    <select
                      className="form-select"
                      value={form.status}
                      onChange={(e) => update("status", e.target.value)}
                    >
                      <option value="Active">Active</option>
                      <option value="Alumni">Alumni</option>
                      <option value="Removed">Removed</option>
                      <option value="Deceased">Deceased</option>
                    </select>
                  </div>
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
                    <div className="col-md-6 mb-3">
                      <label className="form-label">Big</label>
                      <select
                        className="form-select"
                        value={form.big}
                        onChange={(e) => update("big", e.target.value)}
                      >
                        <option value="">None</option>
                        {allMembers
                          .filter((m) => m.rollNo !== created?.rollNo)
                          .map((m) => (
                            <option key={m._id} value={getMemberId(m)}>
                              {m.fName} {m.lName}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div className="col-md-6 mb-3">
                      <label className="form-label">Little</label>
                      <select
                        className="form-select"
                        value={form.little}
                        onChange={(e) => update("little", e.target.value)}
                      >
                        <option value="">None</option>
                        {allMembers
                          .filter((m) => m.rollNo !== created?.rollNo)
                          .map((m) => (
                            <option key={m._id} value={getMemberId(m)}>
                              {m.fName} {m.lName}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-lg-8">
                <div className="mb-4">
                  <h5 className="mb-3">Profile Builder</h5>
                  <div className="row mb-3">
                    <div className="col-md-8">
                      <label className="form-label">Headline / Tagline</label>
                      <input
                        className="form-control"
                        value={form.headline}
                        onChange={(e) => update("headline", e.target.value)}
                        placeholder="Aspiring robotics engineer • Project lead"
                      />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label">Pronouns</label>
                      <input
                        className="form-control"
                        value={form.pronouns}
                        onChange={(e) => update("pronouns", e.target.value)}
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
                        onChange={(e) => update("majors", e.target.value)}
                      />
                    </div>
                    <div className="col-sm-6">
                      <label className="form-label">Minors (comma-separated)</label>
                      <input
                        className="form-control"
                        value={form.minors}
                        onChange={(e) => update("minors", e.target.value)}
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
                        onChange={(e) => update("gradYear", e.target.value)}
                      />
                    </div>
                    <div className="col-sm-4">
                      <label className="form-label">Pledge Class</label>
                      <select
                        className="form-select"
                        value={form.pledgeClass}
                        onChange={(e) => update("pledgeClass", e.target.value)}
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
                        onChange={(e) => update("hometown", e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="mb-3">
                    <label className="form-label">Bio</label>
                    <textarea
                      className="form-control"
                      rows={4}
                      value={form.bio}
                      onChange={(e) => update("bio", e.target.value)}
                      placeholder="Share your story, interests, or what you're working on."
                    />
                  </div>
                </div>

                <div className="mb-4">
                  <h5 className="mb-3">Links & Highlights</h5>
                  <div className="row mb-3">
                    <div className="col-sm-6">
                      <label className="form-label">GitHub URL</label>
                      <input
                        className="form-control"
                        value={form.github}
                        onChange={(e) => update("github", e.target.value)}
                        placeholder="https://github.com/username"
                      />
                    </div>
                    <div className="col-sm-6">
                      <label className="form-label">LinkedIn URL</label>
                      <input
                        className="form-control"
                        value={form.linkedin}
                        onChange={(e) => update("linkedin", e.target.value)}
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
                        onChange={(e) => update("instagram", e.target.value)}
                        placeholder="https://instagram.com/username"
                      />
                    </div>
                    <div className="col-sm-6">
                      <label className="form-label">Personal Website</label>
                      <input
                        className="form-control"
                        value={form.website}
                        onChange={(e) => update("website", e.target.value)}
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
                        onChange={(e) => update("skills", e.target.value)}
                        placeholder="CAD\nPython\nProject Management"
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Fun Facts (one per line)</label>
                      <textarea
                        className="form-control"
                        rows={4}
                        value={form.funFacts}
                        onChange={(e) => update("funFacts", e.target.value)}
                        placeholder="Loves sunrise hikes\nCollects vintage cameras"
                      />
                    </div>
                  </div>
                </div>

                <div className="mb-4">
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

                <div className="mb-4">
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

                <div className="mb-4">
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

                <div className="mb-4">
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
            </div>
          </div>

          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
              Close
            </button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <LoadingSpinner size="sm" className="me-2" />
                  Saving...
                </>
              ) : created ? (
                "Save Changes"
              ) : (
                "Create Profile"
              )}
            </button>
          </div>
        </div>
      </div>

      {showPhotoModal && created && (
        <PhotoUploader
          show={showPhotoModal}
          initialUrl={created.profilePicUrl}
          onError={(msg) => setError(msg)}
          onClose={() => setShowPhotoModal(false)}
          targetRollNo={created.rollNo}
        />
      )}
      {showResumeModal && created && (
        <ResumeUploader
          show={showResumeModal}
          initialUrl={created.resumeUrl}
          onError={(msg) => setError(msg)}
          onClose={() => setShowResumeModal(false)}
          targetRollNo={created.rollNo}
        />
      )}
    </div>
  );
}
