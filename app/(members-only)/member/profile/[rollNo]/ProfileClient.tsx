// app/(members-only)/member/profile/[rollNo]/ProfileClient.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MemberDoc } from "@/types/member";
import ProfileInfoEditor from "./ProfileInfoEditor";
import PhotoUploader from "./PhotoUploader";
import ResumeUploader from "./ResumeUploader";
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
            <section className="mb-4">
              <h4 className="profile-section-title">About</h4>
              <p>{member.bio}</p>
            </section>

            <section className="mb-4">
              <h4 className="profile-section-title">Education</h4>
              <p>
                <strong>Majors:</strong> {member.majors.join(", ")}
              </p>
              <p>
                <strong>Graduation Year:</strong> {member.gradYear}
              </p>
            </section>

            <section className="mb-4">
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

            <div className="mt-4">
              {canEdit && (
                <button
                  className="btn btn-outline-secondary"
                  onClick={() => setEditing((v) => !v)}
                >
                  {editing ? "Cancel" : "Edit Profile"}
                </button>
              )}

              {member.resumeUrl ? (
                <div className="d-flex flex-wrap gap-2 mt-3">
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
                canEdit && (
                  <div>
                    <div className="alert alert-warning mt-3" role="alert">
                      You haven’t uploaded a résumé yet.
                    </div>
                    <div className="d-flex flex-wrap gap-2 mt-3">
                      <button
                        className="btn btn-outline-secondary"
                        onClick={() => setShowResumeModal(true)}
                      >
                        Upload Résumé
                      </button>
                    </div>
                  </div>
                )
              )}
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
          style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="modal-dialog modal-xl modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header bg-light">
                <h5 className="modal-title">Resume Preview</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowPreviewModal(false)}
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
                    Unable to display PDF.{" "}
                    <a href={member.resumeUrl} target="_blank" rel="noopener">
                      Download Resume
                    </a>
                  </p>
                </object>
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
          <div className="modal-dialog modal-lg modal-dialog-centered">
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
