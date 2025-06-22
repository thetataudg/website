// app/(members-only)/member/brothers/MembersList.tsx
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGithub, faLinkedin } from "@fortawesome/free-brands-svg-icons";
import { faUserCircle, faCheck, faTimes, faTriangleExclamation, faHourglass } from "@fortawesome/free-solid-svg-icons";

import { RedirectToSignIn, useAuth, useUser } from "@clerk/nextjs";

export interface MemberData {
  rollNo: string;
  fName: string;
  lName: string;
  majors: string[];
  profilePicUrl?: string;
  socialLinks?: { github?: string; linkedin?: string };
  status: "Active" | "Alumni" | string;
}

export default function MembersList({
  initialMembers,
}: {
  initialMembers: MemberData[];
}) {
  const [filter, setFilter] = useState<"All" | "Active" | "Alumni">("All");
  const [myRollNo, setMyRollNo] = useState<string | null>(null);

  const { isLoaded, isSignedIn } = useAuth();

  // 1) fetch current user's rollNo
  useEffect(() => {
    fetch("/api/members/me")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: { rollNo: string }) => setMyRollNo(data.rollNo))
      .catch(() => setMyRollNo(null));
  }, []);

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

  const filtered = initialMembers.filter((m) =>
    filter === "All" ? true : m.status === filter
  );

  return (
    <div className="container py-5">
      {/* Title + Filter */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="h3">Brothers</h1>
        <select
          className="form-select w-auto"
          onChange={(e) => setFilter(e.target.value as any)}
          value={filter}
        >
          <option>All</option>
          <option>Active</option>
          <option>Alumni</option>
        </select>
      </div>

      {/* Grid */}
      <div className="row g-4">
        {filtered.map((m) => {
          const isMe = m.rollNo === myRollNo;
          // if it's me, go to /member/profile/[rollNo], else brother detail
          const href = isMe
            ? `/member/profile/${m.rollNo}`
            : `/member/brothers/${m.rollNo}`;

          return (
            <div key={m.rollNo} className="col-sm-6 col-md-4 col-lg-3">
              <div className="card h-100 shadow-sm">
                {m.profilePicUrl ? (
                  <img
                    src={m.profilePicUrl}
                    className="card-img-top"
                    style={{ objectFit: "cover", height: 200 }}
                    alt={`${m.fName} ${m.lName}`}
                  />
                ) : (
                  <div
                    className="bg-light d-flex align-items-center justify-content-center"
                    style={{ height: 200 }}
                  >
                    <FontAwesomeIcon
                      icon={faUserCircle}
                      size="6x"
                      className="text-secondary"
                    />
                  </div>
                )}
                <div className="card-body text-center">
                  <h5 className="card-title mb-1">
                    {isMe ? `${m.fName} (You)` : `${m.fName} ${m.lName}`}
                  </h5>
                  <p className="text-muted mb-2">#{m.rollNo}</p>
                  <p className="small text-secondary">{m.majors.join(", ")}</p>
                  <div className="d-flex justify-content-center gap-3 mt-3">
                    {m.socialLinks?.github && (
                      <a
                        href={m.socialLinks.github}
                        target="_blank"
                        rel="noopener"
                      >
                        <FontAwesomeIcon icon={faGithub} size="lg" />
                      </a>
                    )}
                    {m.socialLinks?.linkedin && (
                      <a
                        href={m.socialLinks.linkedin}
                        target="_blank"
                        rel="noopener"
                      >
                        <FontAwesomeIcon icon={faLinkedin} size="lg" />
                      </a>
                    )}
                  </div>
                  <Link href={href}>
                    <button className="btn btn-outline-primary btn-sm mt-3 w-100">
                      View Profile
                    </button>
                  </Link>
                </div>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <p className="text-center text-muted">No members found.</p>
        )}
      </div>
    </div>
  );
}
