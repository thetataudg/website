// app/member/onboard/OnboardForm.tsx
"use client";

import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import ConnectWithDiscordButton from "@/components/ConnectWithDiscordButton";

type Alert = { type: "success" | "danger"; message: string } | null;

export default function OnboardForm({
  invitedEmail,
}: {
  invitedEmail: string;
}) {
  const { user, isLoaded } = useUser();

  const [form, setForm] = useState({
    rollNo: "",
    headline: "",
    pronouns: "",
    majors: "",
    minors: "",
    gradYear: "",
    hometown: "",
    bio: "",
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

  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState<Alert>(null);
  const [showModal, setShowModal] = useState(false);

  const upd = <K extends keyof typeof form>(k: K, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

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

  const parseList = (text: string) =>
    text
      .split(/\n|,/)
      .map((s) => s.trim())
      .filter(Boolean);

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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setAlert(null);

    const payload = {
      rollNo: form.rollNo.trim(),
      headline: form.headline.trim(),
      pronouns: form.pronouns.trim(),
      majors: parseList(form.majors),
      minors: parseList(form.minors),
      gradYear: Number(form.gradYear),
      hometown: form.hometown.trim(),
      bio: form.bio.trim(),
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
    <div className="member-dashboard">
      <section className="bento-card profile-hero onboard-hero">
        <div>
          <div className="hero-eyebrow">Delta Gamma Onboarding</div>
          <h1 className="hero-title">Welcome, {fName}</h1>
          <p className="hero-subtitle">
            Complete your profile to unlock member tools.
          </p>
        </div>
      </section>

      <section className="discord-link-cta">
        <div className="discord-link-cta__inner">
          <h3 className="discord-link-cta__title">Discord Linking Required</h3>
          <p className="discord-link-cta__body">
            In order to get access to the site again please link your Discord
            account so we can connect your membership to the Discord Server.
          </p>
          <ConnectWithDiscordButton className="discord-connect-button" />
        </div>
      </section>

      <form onSubmit={submit} className="bento-card onboard-form profile-editor">
        <div className="onboard-stats">
          <div className="onboard-stat">
            <div className="onboard-stat-label">First Name</div>
            <div className="onboard-stat-value">{fName}</div>
          </div>
          <div className="onboard-stat">
            <div className="onboard-stat-label">Last Name</div>
            <div className="onboard-stat-value">{lName}</div>
          </div>
          <div className="onboard-stat">
            <div className="onboard-stat-label">E-mail</div>
            <div className="onboard-stat-value">{invitedEmail}</div>
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
                onChange={(e) => upd("headline", e.target.value)}
                placeholder="Aspiring robotics engineer • Project lead"
              />
            </div>
            <div className="col-md-4">
              <label className="form-label">Pronouns</label>
              <input
                className="form-control"
                value={form.pronouns}
                onChange={(e) => upd("pronouns", e.target.value)}
                placeholder="he/him, she/her, they/them"
              />
            </div>
          </div>

          <div className="mb-3">
            <label className="form-label">Roll Number</label>
            <input
              className="form-control"
              value={form.rollNo}
              onChange={(e) => upd("rollNo", e.target.value)}
              required
            />
          </div>

          <div className="row mb-3">
            <div className="col-sm-6">
              <label className="form-label">Majors (comma-separated)</label>
              <input
                className="form-control"
                value={form.majors}
                onChange={(e) => upd("majors", e.target.value)}
              />
            </div>
            <div className="col-sm-6">
              <label className="form-label">Minors (comma-separated)</label>
              <input
                className="form-control"
                value={form.minors}
                onChange={(e) => upd("minors", e.target.value)}
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
                onChange={(e) => upd("gradYear", e.target.value)}
              />
            </div>
            <div className="col-sm-4">
              <label className="form-label">Pledge Class</label>
              <select
                className="form-select"
                value={form.pledgeClass}
                onChange={(e) => upd("pledgeClass", e.target.value)}
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
                onChange={(e) => upd("hometown", e.target.value)}
              />
            </div>
          </div>

          <div className="mb-0">
            <label className="form-label">Bio</label>
            <textarea
              className="form-control"
              rows={4}
              value={form.bio}
              onChange={(e) => upd("bio", e.target.value)}
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
                onChange={(e) => upd("github", e.target.value)}
                placeholder="https://github.com/username"
              />
            </div>
            <div className="col-sm-6">
              <label className="form-label">LinkedIn URL</label>
              <input
                className="form-control"
                value={form.linkedin}
                onChange={(e) => upd("linkedin", e.target.value)}
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
                onChange={(e) => upd("instagram", e.target.value)}
                placeholder="https://instagram.com/username"
              />
            </div>
            <div className="col-sm-6">
              <label className="form-label">Personal Website</label>
              <input
                className="form-control"
                value={form.website}
                onChange={(e) => upd("website", e.target.value)}
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
                onChange={(e) => upd("skills", e.target.value)}
                placeholder="CAD\nPython\nProject Management"
              />
            </div>
            <div className="col-md-6">
              <label className="form-label">Fun Facts (one per line)</label>
              <textarea
                className="form-control"
                rows={4}
                value={form.funFacts}
                onChange={(e) => upd("funFacts", e.target.value)}
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
