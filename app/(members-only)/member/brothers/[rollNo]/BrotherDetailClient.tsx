// app/(members-only)/member/brothers/[rollNo]/BrotherDetailClient.tsx
"use client";
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
}

export default function BrotherDetailClient({
  member,
}: BrotherDetailClientProps) {
  const [showPreview, setShowPreview] = useState(false);

  return (
    <>
      {/* ── HEADER ── */}
      <div className="bg-light border-bottom">
        <div className="container py-4">
          <div className="row align-items-center gy-3">
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
            </div>
            <div className="col text-center text-md-start">
              <h2 className="mb-1">
                {member.fName} {member.lName}
              </h2>
              <p className="text-muted mb-0">{member.hometown}</p>
            </div>
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
            {member.bio && (
              <section className="mb-4">
                <h4>About</h4>
                <p>{member.bio}</p>
              </section>
            )}

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

            {/* Résumé Actions */}
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
        </div>
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
