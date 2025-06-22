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
}

export default function ProfileClient({ member }: ProfileClientProps) {
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
      {/* ── HEADER ── */}
      <div className="bg-light border">
        <div className="container py-4">
          <div className="row align-items-center gy-3">
            {/* Photo + action buttons */}
            <div className="col-auto text-center">
              {member.profilePicUrl ? (
                <img
                  src={member.profilePicUrl}
                  alt="Profile"
                  className="rounded-circle shadow-sm"
                  style={{ width: 120, height: 120, objectFit: "cover" }}
                />
              ) : (
                <div
                  className="rounded-circle shadow-sm bg-light d-flex align-items-center justify-content-center"
                  style={{ width: 120, height: 120 }}
                >
                  <FontAwesomeIcon
                    icon={faUserCircle}
                    size="6x"
                    className="text-secondary"
                  />
                </div>
              )}
              <div className="mt-2 d-flex justify-content-center gap-2 flex-wrap">
                {canEdit && (
                  <button
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() => setShowPicModal(true)}
                  >
                    Edit Photo
                  </button>
                )}
              </div>
            </div>

            {/* Name & hometown */}
            <div className="col text-center text-md-start">
              <h2 className="mb-1">
                {member.fName} {member.lName}
              </h2>
              <p className="text-muted mb-0">{member.hometown}</p>
            </div>

            {/* Stats: RollNo / Status / Family */}
            <div className="col-12 col-md-auto d-flex justify-content-center">
              <div className="text-center px-3">
                <h5 className="mb-0">#{member.rollNo}</h5>
                <small className="text-muted">Roll No</small>
              </div>
              <div className="text-center px-3">
                <h5 className="mb-0">{member.status}</h5>
                <small className="text-muted">Status</small>
              </div>
              <div className="text-center px-3">
                <h5 className="mb-0">{member.familyLine}</h5>
                <small className="text-muted">Family Line</small>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div className="container my-4">
        <div className="card bg-white shadow-sm">
          <div className="card-body text-dark">
            {/* About */}
            <section className="mb-4">
              <h4>About</h4>
              <p>{member.bio}</p>
            </section>

            {/* Education */}
            <section className="mb-4">
              <h4>Education</h4>
              <p>
                <strong>Majors:</strong> {member.majors.join(", ")}
              </p>
              <p>
                <strong>Graduation Year:</strong> {member.gradYear}
              </p>
            </section>

            {/* Fraternity Info */}
            <section className="mb-4">
              <h4>Fraternity Info</h4>
              <p>
                <strong>Committees:</strong>{" "}
                {member.committees.length
                  ? member.committees.join(", ")
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

              {/* résumé area */}
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
        </div>
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
        <ProfileInfoEditor
          member={member}
          onDone={() => {
            setEditing(false);
            router.refresh();
          }}
        />
      )}
      </>
  );
}