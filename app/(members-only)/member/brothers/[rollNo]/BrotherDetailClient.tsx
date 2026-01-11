// app/(members-only)/member/brothers/[rollNo]/BrotherDetailClient.tsx
"use client";

import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import { faCheck, faTimes, faTriangleExclamation, faHourglass } from "@fortawesome/free-solid-svg-icons";

import { useMemo, useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUserCircle,
  faDownload,
  faEye,
} from "@fortawesome/free-solid-svg-icons";

import type { MemberDoc } from "@/types/member";

interface BrotherDetailClientProps {
  member: MemberDoc;
  committees: { name: string }[];
}

export default function BrotherDetailClient({
  member,
  committees,
}: BrotherDetailClientProps) {
  const [showPreview, setShowPreview] = useState(false);
  const [viewer, setViewer] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"profile" | "events">("profile");
  const [attendanceEvents, setAttendanceEvents] = useState<any[]>([]);
  const [attendanceTotal, setAttendanceTotal] = useState(0);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceStart, setAttendanceStart] = useState("");
  const [attendanceEnd, setAttendanceEnd] = useState("");

  const { isLoaded, isSignedIn } = useAuth();
  const skills = (member.skills || []).filter(Boolean);
  const projects = (member.projects || []).filter((p) => p?.title || p?.description || p?.link);
  const work = (member.work || []).filter((w) => w?.title || w?.organization || w?.description);
  const awards = (member.awards || []).filter((a) => a?.title || a?.issuer || a?.description);
  const funFacts = (member.funFacts || []).filter(Boolean);
  const customSections = (member.customSections || []).filter((s) => s?.title || s?.body);

  const profileMemberId =
    typeof (member as any)?._id === "string"
      ? (member as any)._id
      : (member as any)?._id?.toString?.() || "";

  const isPrivileged =
    viewer?.role === "admin" ||
    viewer?.role === "superadmin" ||
    viewer?.isECouncil;

  useEffect(() => {
    async function loadViewer() {
      try {
        const res = await fetch("/api/members/me");
        if (!res.ok) return;
        const data = await res.json();
        setViewer(data);
      } catch {
        setViewer(null);
      }
    }
    if (isSignedIn) loadViewer();
  }, [isSignedIn]);

  useEffect(() => {
    const now = new Date();
    const start = new Date();
    start.setDate(now.getDate() - 30);
    const pad = (n: number) => String(n).padStart(2, "0");
    setAttendanceStart(
      `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`
    );
    setAttendanceEnd(
      `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    );
  }, []);

  useEffect(() => {
    if (!isSignedIn || !profileMemberId || !attendanceStart || !attendanceEnd)
      return;
    const loadAttendance = async () => {
      setAttendanceLoading(true);
      const params = new URLSearchParams({
        memberId: profileMemberId,
        start: attendanceStart,
        end: attendanceEnd,
      });
      const res = await fetch(`/api/events/attendance?${params.toString()}`);
      const data = res.ok ? await res.json() : null;
      if (data?.events) {
        setAttendanceEvents(data.events);
        setAttendanceTotal(data.events.length);
      } else {
        setAttendanceEvents([]);
        setAttendanceTotal(data?.total || 0);
      }
      setAttendanceLoading(false);
    };
    loadAttendance();
  }, [isSignedIn, profileMemberId, attendanceStart, attendanceEnd]);

  const attendanceByCommittee = useMemo(() => {
    if (!isPrivileged) return [];
    const tally = new Map<string, number>();
    attendanceEvents.forEach((evt) => {
      const key = evt.committeeName || "Chapter";
      tally.set(key, (tally.get(key) || 0) + 1);
    });
    return Array.from(tally.entries()).map(([name, count]) => ({
      name,
      count,
    }));
  }, [attendanceEvents, isPrivileged]);

  const attendanceByType = useMemo(() => {
    if (!isPrivileged) return [];
    const tally = new Map<string, number>();
    attendanceEvents.forEach((evt) => {
      const key = evt.eventType || "event";
      tally.set(key, (tally.get(key) || 0) + 1);
    });
    return Array.from(tally.entries()).map(([type, count]) => ({
      type,
      count,
    }));
  }, [attendanceEvents, isPrivileged]);

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
            {isPrivileged && (
              <div className="profile-tabs">
                <button
                  type="button"
                  className={`profile-tab ${activeTab === "profile" ? "is-active" : ""}`}
                  onClick={() => setActiveTab("profile")}
                >
                  Profile
                </button>
                <button
                  type="button"
                  className={`profile-tab ${activeTab === "events" ? "is-active" : ""}`}
                  onClick={() => setActiveTab("events")}
                >
                  Events
                </button>
              </div>
            )}

            {(!isPrivileged || activeTab === "profile") && (
              <>
                <div className="profile-content-grid">
                  <div className="profile-content-stack">
                    <section className="profile-card">
                      <h4 className="profile-section-title">About</h4>
                      <p>{member.bio || "This brother is still building their profile."}</p>
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
                          <strong>
                            Little{member.littles.length > 1 ? "s" : ""}:
                          </strong>{" "}
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
                          <button
                            className="btn btn-outline-secondary"
                            onClick={() => setShowPreview(true)}
                          >
                            <FontAwesomeIcon icon={faEye} className="me-1" />
                            Preview Résumé
                          </button>
                        </div>
                      ) : (
                        <div className="alert alert-warning mt-2" role="alert">
                          {member.fName} hasn&apos;t uploaded a resume yet.
                        </div>
                      )}
                    </section>
                  </div>
                </div>
              </>
            )}

            {(isPrivileged && activeTab === "events") && (
              <section className="mt-3">
                <h4 className="profile-section-title">Event Attendance</h4>
                <div className="row g-3 align-items-end">
                  <div className="col-md-4">
                    <label className="form-label">Start date</label>
                    <input
                      type="date"
                      className="form-control"
                      value={attendanceStart}
                      onChange={(e) => setAttendanceStart(e.target.value)}
                    />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label">End date</label>
                    <input
                      type="date"
                      className="form-control"
                      value={attendanceEnd}
                      onChange={(e) => setAttendanceEnd(e.target.value)}
                    />
                  </div>
                  <div className="col-md-4">
                    <div className="profile-stat">
                      <div className="fw-semibold">{attendanceTotal}</div>
                      <small className="text-muted">Events attended</small>
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="profile-section-title">Committee totals</div>
                  <div className="d-flex flex-wrap gap-2 mt-2">
                    {attendanceByCommittee.length ? (
                      attendanceByCommittee.map((item) => (
                        <span key={item.name} className="event-pill">
                          {item.name} ({item.count})
                        </span>
                      ))
                    ) : (
                      <span className="text-muted">No attendance yet.</span>
                    )}
                  </div>
                </div>

                <div className="mt-4">
                  <div className="profile-section-title">Event types</div>
                  <div className="d-flex flex-wrap gap-2 mt-2">
                    {attendanceByType.length ? (
                      attendanceByType.map((item) => (
                        <span key={item.type} className="event-pill event-pill--type">
                          {item.type} ({item.count})
                        </span>
                      ))
                    ) : (
                      <span className="text-muted">No attendance yet.</span>
                    )}
                  </div>
                </div>

                <div className="mt-4">
                  <div className="profile-section-title">Events</div>
                  {attendanceLoading ? (
                    <p className="text-muted">Loading attendance…</p>
                  ) : attendanceEvents.length ? (
                    <div className="table-responsive">
                      <table className="table admin-table">
                        <thead>
                          <tr>
                            <th>Event</th>
                            <th>Committee</th>
                            <th>Type</th>
                            <th className="text-end">Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {attendanceEvents.map((evt) => (
                            <tr key={evt._id}>
                              <td>{evt.name}</td>
                              <td>{evt.committeeName || "Chapter"}</td>
                              <td>{evt.eventType || "event"}</td>
                              <td className="text-end">
                                {evt.startTime
                                  ? new Date(evt.startTime).toLocaleDateString()
                                  : ""}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-muted">No attendance in this range.</p>
                  )}
                </div>
              </section>
            )}

            {!isPrivileged && (
              <section className="mt-4">
                <h4 className="profile-section-title">Event Attendance</h4>
                <div className="row g-3 align-items-end">
                  <div className="col-md-4">
                    <label className="form-label">Start date</label>
                    <input
                      type="date"
                      className="form-control"
                      value={attendanceStart}
                      onChange={(e) => setAttendanceStart(e.target.value)}
                    />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label">End date</label>
                    <input
                      type="date"
                      className="form-control"
                      value={attendanceEnd}
                      onChange={(e) => setAttendanceEnd(e.target.value)}
                    />
                  </div>
                  <div className="col-md-4">
                    <div className="profile-stat">
                      <div className="fw-semibold">{attendanceTotal}</div>
                      <small className="text-muted">Total events attended</small>
                    </div>
                  </div>
                </div>
              </section>
            )}
          </div>
        </section>
      </div>

      {/* ── PREVIEW MODAL ── */}
      {showPreview && (
        <div
          className="modal fade show"
          style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="modal-dialog modal-xl modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header bg-light">
                <h5 className="modal-title">Résumé Preview</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowPreview(false)}
                />
              </div>
              <div className="modal-body p-0" style={{ height: "85vh" }}>
                <object
                  data={member.resumeUrl + "#toolbar=0&navpanes=0&scrollbar=0"}
                  type="application/pdf"
                  width="100%"
                  height="100%"
                >
                  <p className="text-center mt-5">
                    Unable to display PDF inline.{" "}
                    <a href={member.resumeUrl} target="_blank" rel="noopener">
                      Download Résumé
                    </a>
                  </p>
                </object>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
