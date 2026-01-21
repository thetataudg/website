// app/(members-only)/member/profile/[rollNo]/ProfileInfoEditor.tsx
"use client";

import { useState } from "react";
import type { MemberDoc } from "@/types/member";
import { LoadingSpinner } from "../../../components/LoadingState";

const resolveRollNo = (entry: any) => {
  if (!entry) return "";
  if (typeof entry === "string") return entry;
  if (typeof entry.rollNo === "string") return entry.rollNo;
  if (entry.memberId) {
    if (typeof entry.memberId === "string") return entry.memberId;
    if (Array.isArray(entry.memberId) && entry.memberId.length) {
      return typeof entry.memberId[0] === "string"
        ? entry.memberId[0]
        : entry.memberId[0]?.rollNo || "";
    }
    if (typeof entry.memberId.rollNo === "string") return entry.memberId.rollNo;
  }
  return "";
};

type ProjectItem = { title: string; description: string; link: string };
type WorkItem = {
  title: string;
  organization: string;
  start: string;
  end: string;
  description: string;
  link: string;
};
type AwardItem = { title: string; issuer: string; date: string; description: string };
type CustomSection = { title: string; body: string };

export default function ProfileInfoEditor({
  member,
  onDone,
}: {
  member: MemberDoc;
  onDone: () => void;
}) {
  const socials = member.socialLinks || {};
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

  const [form, setForm] = useState({
    headline: member.headline || "",
    pronouns: member.pronouns || "",
    majors: member.majors.join(", "),
    minors: member.minors?.join(", ") || "",
    gradYear: member.gradYear.toString(),
    bio: member.bio || "",
    hometown: member.hometown,
    pledgeClass: member.pledgeClass || "",
    big: resolveRollNo(member.bigs?.[0]),
    littles: (member.littles || [])
      .map((entry) => resolveRollNo(entry))
      .filter(Boolean)
      .join(", "),
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
  const [loading, setLoading] = useState(false);

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

  const addArrayItem = (key: "projects" | "work" | "awards" | "customSections") =>
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const payload = {
      headline: form.headline.trim(),
      pronouns: form.pronouns.trim(),
      majors: parseList(form.majors),
      minors: parseList(form.minors),
      gradYear: Number(form.gradYear),
      bio: form.bio,
      hometown: form.hometown,
      pledgeClass: form.pledgeClass.trim(),
      bigs: form.big ? [form.big.trim()] : [],
      littles: parseList(form.littles).slice(0, 5),
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
    <form onSubmit={handleSave} className="profile-editor">
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

        <div className="row mb-3">
          <div className="col-sm-6">
            <label className="form-label">Big (roll number)</label>
            <input
              className="form-control"
              value={form.big}
              onChange={(e) => updateField("big", e.target.value)}
              placeholder="e.g. 12345"
            />
          </div>
          <div className="col-sm-6">
            <label className="form-label">Littles (comma-separated, up to 5)</label>
            <input
              className="form-control"
              value={form.littles}
              onChange={(e) => updateField("littles", e.target.value)}
              placeholder="e.g. 54321, 67890"
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

      <button className="btn btn-primary align-self-start" disabled={loading}>
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
