// app/(members-only)/member/profile/[rollNo]/ProfileClient.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { MemberDoc } from "@/types/member";
import ProfileInfoEditor from "./ProfileInfoEditor";
import PhotoUploader from "./PhotoUploader";
import ResumeUploader from "./ResumeUploader";
import ConnectWithDiscordButton from "@/components/ConnectWithDiscordButton";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { RedirectToSignIn, useAuth, useUser } from "@clerk/nextjs";

import {
  faUserCircle,
  faEye,
  faDownload,
  faTimes,
  faHourglass,
} from "@fortawesome/free-solid-svg-icons";

interface ProfileClientProps {
  member: MemberDoc;
  committees: { name: string }[];
}

export default function ProfileClient({ member, committees }: ProfileClientProps) {
  const [editing, setEditing] = useState(false);
  const [showPicModal, setShowPicModal] = useState(false);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const router = useRouter();

  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();

  useEffect(() => {
    if (!showPreviewModal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowPreviewModal(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showPreviewModal]);

  if (!isLoaded) {
    return (
      <div className="container">
        <div className="alert alert-info d-flex align-items-center mt-5" role="alert">
          <FontAwesomeIcon icon={faHourglass} className="h2" />
          <h2>Loading...</h2>
        </div>
      </div>
    );
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

  // Only allow editing if this is the logged-in user's profile
  const canEdit = isSignedIn && user && user.id === member.clerkId;
  const skills = (member.skills || []).filter(Boolean);
  const projects = (member.projects || []).filter((p) => p?.title || p?.description || p?.link);
  const work = (member.work || []).filter((w) => w?.title || w?.organization || w?.description);
  const awards = (member.awards || []).filter((a) => a?.title || a?.issuer || a?.description);
  const funFacts = (member.funFacts || []).filter(Boolean);
  const customSections = (member.customSections || []).filter((s) => s?.title || s?.body);

  return (
    <>
      <div className="member-dashboard">
        <section className="bento-card profile-hero">
          <div className="profile-identity text-center">
            {member.profilePicUrl ? (
              <img
                src={member.profilePicUrl}
                alt="Profile"
                className="profile-photo"
              />
            ) : (
              <div className="profile-photo-placeholder">
                <FontAwesomeIcon
                  icon={faUserCircle}
                  size="4x"
                  className="text-muted"
                />
              </div>
            )}
            {canEdit && (
              <div className="profile-actions mt-2 justify-content-center">
                <button
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => setShowPicModal(true)}
                >
                  Edit Photo
                </button>
              </div>
            )}
          </div>

          <div>
            <h2 className="profile-title">
              {member.fName} {member.lName}
            </h2>
            <p className="profile-subtitle">{member.hometown}</p>
            {member.headline && (
              <p className="text-muted mb-1">{member.headline}</p>
            )}
            {member.pronouns && (
              <span className="profile-pill">{member.pronouns}</span>
            )}
          </div>

          <div className="profile-stats">
            <div className="profile-stat">
              <div className="fw-semibold">#{member.rollNo}</div>
              <small className="text-muted">Roll No</small>
            </div>
            <div className="profile-stat">
              <div className="fw-semibold">{member.status}</div>
              <small className="text-muted">Status</small>
            </div>
            <div className="profile-stat">
              <div className="fw-semibold">{member.familyLine}</div>
              <small className="text-muted">Family Line</small>
            </div>
          </div>
        </section>

        <section className="bento-card mt-4">
          <div className="card-body">
            <div className="d-flex flex-wrap gap-2 mb-4 profile-actions">
              {canEdit && (
                <button
                  className="btn btn-outline-secondary"
                  onClick={() => setEditing((v) => !v)}
                >
                  {editing ? "Cancel" : "Edit Profile"}
                </button>
              )}
              {canEdit && !member.discordId && (
                <ConnectWithDiscordButton className="discord-connect-button" />
              )}
            </div>

            <div className="profile-content-grid">
              <div className="profile-content-stack">
                <section className="profile-card">
                  <h4 className="profile-section-title">About</h4>
                  <p>{member.bio || "Share your story to personalize your profile."}</p>
                </section>

                {projects.length > 0 && (
                  <section className="profile-card">
                    <h4 className="profile-section-title">Projects</h4>
                    <div className="d-flex flex-column gap-3">
                      {projects.map((project, idx) => (
                        <div key={`project-${idx}`} className="border rounded p-3">
                          <div className="fw-semibold">{project.title || "Project"}</div>
                          {project.description && <p className="mb-2">{project.description}</p>}
                          {project.link && (
                            <a href={project.link} target="_blank" rel="noreferrer">
                              {project.link}
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {work.length > 0 && (
                  <section className="profile-card">
                    <h4 className="profile-section-title">Work & Internships</h4>
                    <div className="d-flex flex-column gap-3">
                      {work.map((item, idx) => (
                        <div key={`work-${idx}`} className="border rounded p-3">
                          <div className="fw-semibold">
                            {item.title || "Role"} {item.organization ? `• ${item.organization}` : ""}
                          </div>
                          {(item.start || item.end) && (
                            <div className="text-muted">
                              {[item.start, item.end].filter(Boolean).join(" - ")}
                            </div>
                          )}
                          {item.description && <p className="mb-2">{item.description}</p>}
                          {item.link && (
                            <a href={item.link} target="_blank" rel="noreferrer">
                              {item.link}
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {awards.length > 0 && (
                  <section className="profile-card">
                    <h4 className="profile-section-title">Awards & Certifications</h4>
                    <div className="d-flex flex-column gap-3">
                      {awards.map((award, idx) => (
                        <div key={`award-${idx}`} className="border rounded p-3">
                          <div className="fw-semibold">
                            {award.title || "Award"} {award.issuer ? `• ${award.issuer}` : ""}
                          </div>
                          {award.date && <div className="text-muted">{award.date}</div>}
                          {award.description && <p className="mb-0">{award.description}</p>}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {customSections.length > 0 && (
                  <section className="profile-card">
                    <h4 className="profile-section-title">More</h4>
                    <div className="d-flex flex-column gap-3">
                      {customSections.map((section, idx) => (
                        <div key={`section-${idx}`} className="border rounded p-3">
                          <div className="fw-semibold">{section.title || "Section"}</div>
                          {section.body && <p className="mb-0">{section.body}</p>}
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>

              <div className="profile-content-stack">
                <section className="profile-card">
                  <h4 className="profile-section-title">Education</h4>
                  <p>
                    <strong>Majors:</strong> {member.majors.join(", ")}
                  </p>
                  {member.minors?.length ? (
                    <p>
                      <strong>Minors:</strong> {member.minors.join(", ")}
                    </p>
                  ) : null}
                  <p>
                    <strong>Graduation Year:</strong> {member.gradYear}
                  </p>
                </section>

                <section className="profile-card">
                  <h4 className="profile-section-title">Fraternity Info</h4>
                  <p>
                    <strong>Committees:</strong>{" "}
                    {committees.length
                      ? committees.map((c) => c.name).join(", ")
                      : "None"}
                  </p>
                  <p>
                    <strong>Pledge Class:</strong> {member.pledgeClass || "—"}
                  </p>
                  {member.bigs?.length > 0 && (
                    <p className="mb-1">
                      <strong>Big{member.bigs.length > 1 ? "s" : ""}:</strong>{" "}
                      {member.bigs
                        .map((b: any) =>
                          typeof b === "string"
                            ? b
                            : `${b.fName ?? ""} ${b.lName ?? ""}`.trim()
                        )
                        .join(", ")}
                    </p>
                  )}
                  {member.littles?.length > 0 && (
                    <p>
                      <strong>Little{member.littles.length > 1 ? "s" : ""}:</strong>{" "}
                      {member.littles
                        .map((l: any) =>
                          typeof l === "string"
                            ? l
                            : `${l.fName ?? ""} ${l.lName ?? ""}`.trim()
                        )
                        .join(", ")}
                    </p>
                  )}
                </section>

                {skills.length > 0 && (
                  <section className="profile-card">
                    <h4 className="profile-section-title">Skills</h4>
                    <div className="d-flex flex-wrap gap-2">
                      {skills.map((skill, idx) => (
                        <span key={`${skill}-${idx}`} className="profile-pill">
                          {skill}
                        </span>
                      ))}
                    </div>
                  </section>
                )}

                {funFacts.length > 0 && (
                  <section className="profile-card">
                    <h4 className="profile-section-title">Fun Facts</h4>
                    <ul className="mb-0">
                      {funFacts.map((fact, idx) => (
                        <li key={`fact-${idx}`}>{fact}</li>
                      ))}
                    </ul>
                  </section>
                )}

                <section className="profile-card">
                  <h4 className="profile-section-title">Resume</h4>
                  {member.resumeUrl ? (
                    <div className="d-flex flex-wrap gap-2">
                      <a
                        href={member.resumeUrl}
                        download
                        className="btn btn-outline-secondary"
                      >
                        <FontAwesomeIcon icon={faDownload} className="me-1" />
                        Download Résumé
                      </a>
                      {canEdit && (
                        <>
                          <button
                            className="btn btn-outline-secondary"
                            onClick={() => setShowResumeModal(true)}
                          >
                            Upload New Résumé
                          </button>
                          <button
                            className="btn btn-outline-secondary"
                            onClick={() => setShowPreviewModal(true)}
                          >
                            <FontAwesomeIcon icon={faEye} className="me-1" />
                            Preview Résumé
                          </button>
                        </>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="alert alert-warning mt-2" role="alert">
                        You haven’t uploaded a résumé yet.
                      </div>
                      {canEdit && (
                        <button
                          className="btn btn-outline-secondary"
                          onClick={() => setShowResumeModal(true)}
                        >
                          Upload Résumé
                        </button>
                      )}
                    </>
                  )}
                </section>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ── MODALS ── */}
      <PhotoUploader
        show={showPicModal}
        initialUrl={member.profilePicUrl}
        onClose={() => setShowPicModal(false)}
        onError={(msg) => console.error(msg)}
      />

      <ResumeUploader
        show={showResumeModal}
        initialUrl={member.resumeUrl}
        onClose={() => setShowResumeModal(false)}
        onError={(msg) => console.error(msg)}
      />

      {showPreviewModal && (
        <div
          className="modal fade show"
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowPreviewModal(false);
          }}
          style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable modal-fullscreen-sm-down">
            <div className="modal-content">
              <div className="modal-header bg-light">
                <h5 className="modal-title">Resume Preview</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowPreviewModal(false)}
                />
              </div>
              <div className="modal-body p-0" style={{ height: "clamp(320px, 70vh, 900px)" }}>
                <object
                  data={member.resumeUrl + "#toolbar=0&navpanes=0&scrollbar=0"}
                  type="application/pdf"
                  width="100%"
                  height="100%"
                >
                  <p className="text-center mt-5">
                    Unable to display PDF.{" "}
                    <a href={member.resumeUrl} target="_blank" rel="noopener">
                      Download Resume
                    </a>
                  </p>
                </object>
              </div>
              <div className="modal-footer">
                <a
                  href={member.resumeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-outline-secondary"
                >
                  Open in New Tab
                </a>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowPreviewModal(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editing && canEdit && (
        <div
          className="modal fade show"
          style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="modal-dialog modal-xl modal-dialog-centered profile-editor-modal">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Edit Profile</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setEditing(false)}
                />
              </div>
              <div className="modal-body">
                <ProfileInfoEditor
                  member={member}
                  onDone={() => {
                    setEditing(false);
                    router.refresh();
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
