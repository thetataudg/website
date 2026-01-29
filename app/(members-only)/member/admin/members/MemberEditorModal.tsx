// app/(members-only)/member/admin/members/MemberEditorModal.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { LoadingSpinner } from "../../../components/LoadingState";
import PhotoUploader from "../../profile/[rollNo]/PhotoUploader";
import ResumeUploader from "../../profile/[rollNo]/ResumeUploader";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faLock,
  faImage,
  faEye,
  faEyeSlash,
  faUpload,
  faUserTag,
} from "@fortawesome/free-solid-svg-icons";

type ProjectItem = { title?: string; description?: string; link?: string };
type WorkItem = {
  title?: string;
  organization?: string;
  start?: string;
  end?: string;
  description?: string;
  link?: string;
};
type AwardItem = {
  title?: string;
  issuer?: string;
  date?: string;
  description?: string;
};
type CustomSection = { title?: string; body?: string };

export interface MemberData {
  _id: string;
  rollNo: string;
  fName: string;
  lName: string;
  clerkId?: string;
  discordId?: string;
  role: "superadmin" | "admin" | "member";
  status?: "Active" | "Alumni" | "Removed" | "Deceased";
  isECouncil: boolean;
  ecouncilPosition: string;
  isCommitteeHead: boolean;
  familyLine: string;
  bigs: any[];
  littles: any[];
  majors: string[];
  minors?: string[];
  gradYear: number;
  bio?: string;
  headline?: string;
  pronouns?: string;
  skills?: string[];
  funFacts?: string[];
  projects?: ProjectItem[];
  work?: WorkItem[];
  awards?: AwardItem[];
  customSections?: CustomSection[];
  hometown?: string;
  pledgeClass?: string;
  socialLinks?: Record<string, string>;
  profilePicUrl?: string;
  resumeUrl?: string;
  isHidden?: boolean;
}

interface MemberShort {
  _id: string;
  fName: string;
  lName: string;
}

interface Props {
  member: MemberData;
  show: boolean;
  onClose: () => void;
  onSave: (updates: Partial<MemberData>) => Promise<void>;
  editorRole: "superadmin" | "admin";
}

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

export default function MemberEditorModal({
  member,
  show,
  onClose,
  onSave,
  editorRole,
}: Props) {
  const socials = member.socialLinks || {};
  const [form, setForm] = useState({
    rollNo: member.rollNo,
    fName: member.fName,
    lName: member.lName,
    status: member.status || "Active",
    role: member.role,
    isHidden: Boolean(member.isHidden),
    isECouncil: member.isECouncil,
    ecouncilPosition: member.ecouncilPosition,
    isCommitteeHead: member.isCommitteeHead,
    familyLine: member.familyLine,
    discordId: member.discordId || "",
    big: getMemberId(member.bigs?.[0]),
    little: getMemberId(member.littles?.[0]),
    headline: member.headline || "",
    pronouns: member.pronouns || "",
    majors: (member.majors || []).join(", "),
    minors: member.minors?.join(", ") || "",
    gradYear: member.gradYear ? String(member.gradYear) : "",
    bio: member.bio || "",
    hometown: member.hometown || "",
    pledgeClass: member.pledgeClass || "",
    skills: (member.skills || []).join("\n"),
    funFacts: (member.funFacts || []).join("\n"),
    github: socials.github || "",
    linkedin: socials.linkedin || "",
    instagram: socials.instagram || "",
    website: socials.website || "",
    projects: (member.projects || []).map((p) => ({
      title: p.title || "",
      description: p.description || "",
      link: p.link || "",
    })),
    work: (member.work || []).map((w) => ({
      title: w.title || "",
      organization: w.organization || "",
      start: w.start || "",
      end: w.end || "",
      description: w.description || "",
      link: w.link || "",
    })),
    awards: (member.awards || []).map((a) => ({
      title: a.title || "",
      issuer: a.issuer || "",
      date: a.date || "",
      description: a.description || "",
    })),
    customSections: (member.customSections || []).map((s) => ({
      title: s.title || "",
      body: s.body || "",
    })),
  });

  const [allMembers, setAllMembers] = useState<MemberShort[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!show) return;
    setForm({
      rollNo: member.rollNo,
      fName: member.fName,
      lName: member.lName,
      status: member.status || "Active",
      role: member.role,
      isHidden: Boolean(member.isHidden),
      isECouncil: member.isECouncil,
      ecouncilPosition: member.ecouncilPosition,
      isCommitteeHead: member.isCommitteeHead,
      familyLine: member.familyLine,
      discordId: member.discordId || "",
      big: getMemberId(member.bigs?.[0]),
      little: getMemberId(member.littles?.[0]),
      headline: member.headline || "",
      pronouns: member.pronouns || "",
      majors: (member.majors || []).join(", "),
      minors: member.minors?.join(", ") || "",
      gradYear: member.gradYear ? String(member.gradYear) : "",
      bio: member.bio || "",
      hometown: member.hometown || "",
      pledgeClass: member.pledgeClass || "",
      skills: (member.skills || []).join("\n"),
      funFacts: (member.funFacts || []).join("\n"),
      github: socials.github || "",
      linkedin: socials.linkedin || "",
      instagram: socials.instagram || "",
      website: socials.website || "",
      projects: (member.projects || []).map((p) => ({
        title: p.title || "",
        description: p.description || "",
        link: p.link || "",
      })),
      work: (member.work || []).map((w) => ({
        title: w.title || "",
        organization: w.organization || "",
        start: w.start || "",
        end: w.end || "",
        description: w.description || "",
        link: w.link || "",
      })),
      awards: (member.awards || []).map((a) => ({
        title: a.title || "",
        issuer: a.issuer || "",
        date: a.date || "",
        description: a.description || "",
      })),
      customSections: (member.customSections || []).map((s) => ({
        title: s.title || "",
        body: s.body || "",
      })),
    });

    fetch("/api/members")
      .then((r) => r.json())
      .then((list: MemberData[]) => {
        setAllMembers(
          list
            .filter((m) => m.role !== "superadmin" && m.rollNo !== member.rollNo)
            .map((m) => ({
              _id: m._id,
              fName: m.fName,
              lName: m.lName,
            }))
        );
      })
      .catch(console.error);
  }, [show, member]);

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

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    const gradYear = Number(form.gradYear);
    const discordIdValue = form.discordId.trim();
    const payload: Partial<MemberData> = {
      rollNo: form.rollNo.trim(),
      fName: form.fName.trim(),
      lName: form.lName.trim(),
      status: form.status,
      isHidden: form.isHidden,
      isECouncil: form.isECouncil,
      ecouncilPosition: form.isECouncil ? form.ecouncilPosition : "",
      isCommitteeHead: form.isCommitteeHead,
      familyLine: form.familyLine,
      discordId: discordIdValue || undefined,
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
    };

    if (
      editorRole === "superadmin" &&
      member.role !== "superadmin" &&
      (form.role === "admin" || form.role === "member")
    ) {
      payload.role = form.role;
    }

    try {
      await onSave(payload);
      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const resolvedPhotoUrl = useMemo(() => {
    const raw = member.profilePicUrl?.trim() || "";
    if (!raw) return "";
    if (raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("data:")) {
      return raw;
    }
    if (raw.startsWith("/")) return raw;
    return "";
  }, [member.profilePicUrl]);

  const photoLabel = useMemo(
    () => (resolvedPhotoUrl ? "Update Photo" : "Add Photo"),
    [resolvedPhotoUrl]
  );
  const resumeLabel = useMemo(
    () => (member.resumeUrl ? "Update Resume" : "Add Resume"),
    [member.resumeUrl]
  );

  if (!show) return null;
  return (
    <div
      className="modal fade show"
      style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)" }}
    >
      <div className="modal-dialog modal-xl modal-dialog-scrollable admin-modal-wide">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Edit {member.fName}’s Profile</h5>
            <button className="btn-close" onClick={onClose} />
          </div>

          {saved && (
            <div className="alert alert-success m-3">✔ Changes saved!</div>
          )}
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
                    {resolvedPhotoUrl ? (
                      <img
                        src={resolvedPhotoUrl}
                        alt={`${member.fName} ${member.lName}`}
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
                    >
                      <FontAwesomeIcon icon={faImage} className="me-2" />
                      {photoLabel}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm w-100 mt-2"
                      onClick={() => setShowResumeModal(true)}
                    >
                      <FontAwesomeIcon icon={faUpload} className="me-2" />
                      {resumeLabel}
                    </button>
                  </div>
                </div>

                <div className="border rounded p-3 mt-3">
                  <h6 className="mb-3">Admin Controls</h6>
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
                    <label className="form-label">Roll No</label>
                    <input
                      className="form-control"
                      value={form.rollNo}
                      onChange={(e) => update("rollNo", e.target.value)}
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
                  <div className="mb-3">
                    <label className="form-label">
                      Discord User ID{" "}
                      <a
                        href="https://support.discord.com/hc/en-us/articles/206346498-Where-can-I-find-my-User-Server-Message-ID"
                        target="_blank"
                        rel="noreferrer"
                      >
                        (how to find it)
                      </a>
                    </label>
                    <input
                      className="form-control"
                      value={form.discordId}
                      onChange={(e) => update("discordId", e.target.value)}
                      placeholder="123456789012345678"
                    />
                  </div>
                  <div className="form-check mb-3">
                    <input
                      id="isAdmin"
                      type="checkbox"
                      className="form-check-input"
                      checked={form.role === "admin"}
                      disabled={
                        editorRole !== "superadmin" || member.role === "superadmin"
                      }
                      onChange={(e) =>
                        update("role", e.target.checked ? "admin" : "member")
                      }
                    />
                    <label htmlFor="isAdmin" className="form-check-label">
                      Admin
                    </label>
                    {editorRole !== "superadmin" && (
                      <FontAwesomeIcon
                        icon={faLock}
                        className="ms-2 text-muted"
                        title="Only superadmins can change"
                      />
                    )}
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
                        {allMembers.map((m) => (
                          <option key={m._id} value={m._id}>
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
                        {allMembers.map((m) => (
                          <option key={m._id} value={m._id}>
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
                  {form.projects.map((project: ProjectItem, index: number) => (
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
                              updateArrayItem<ProjectItem, "title">(
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
                              updateArrayItem<ProjectItem, "link">(
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
                          updateArrayItem<ProjectItem, "description">(
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
                  {form.work.map((item: WorkItem, index: number) => (
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
                              updateArrayItem<WorkItem, "title">(
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
                              updateArrayItem<WorkItem, "organization">(
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
                              updateArrayItem<WorkItem, "start">(
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
                              updateArrayItem<WorkItem, "end">(
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
                              updateArrayItem<WorkItem, "link">(
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
                          updateArrayItem<WorkItem, "description">(
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
                  {form.awards.map((award: AwardItem, index: number) => (
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
                              updateArrayItem<AwardItem, "title">(
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
                              updateArrayItem<AwardItem, "issuer">(
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
                              updateArrayItem<AwardItem, "date">(
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
                          updateArrayItem<AwardItem, "description">(
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
                  {form.customSections.map((section: CustomSection, index: number) => (
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
                          updateArrayItem<CustomSection, "title">(
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
                          updateArrayItem<CustomSection, "body">(
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
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <LoadingSpinner size="sm" className="me-2" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </button>
          </div>
        </div>
      </div>

      {showPhotoModal && (
        <PhotoUploader
          show={showPhotoModal}
          initialUrl={member.profilePicUrl}
          onError={(msg) => setError(msg)}
          onClose={() => setShowPhotoModal(false)}
          targetRollNo={member.rollNo}
        />
      )}
      {showResumeModal && (
        <ResumeUploader
          show={showResumeModal}
          initialUrl={member.resumeUrl}
          onError={(msg) => setError(msg)}
          onClose={() => setShowResumeModal(false)}
          targetRollNo={member.rollNo}
        />
      )}
    </div>
  );
}
