// app/(members-only)/member/brothers/[rollNo]/BrotherDetailClient.tsx
"use client";

import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import { faCheck, faTimes, faTriangleExclamation, faHourglass } from "@fortawesome/free-solid-svg-icons";

import { useState } from "react";
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

  const { isLoaded, isSignedIn } = useAuth();

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
            {member.bio && (
              <section className="mb-4">
                <h4 className="profile-section-title">About</h4>
                <p>{member.bio}</p>
              </section>
            )}

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

            {member.resumeUrl ? (
              <div className="mt-4 d-flex flex-wrap gap-2">
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
              <div className="alert alert-warning mt-4" role="alert">
                {member.fName} hasn't uploaded a resume yet.
              </div>
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
