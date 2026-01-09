// app/(members-only)/member/brothers/MembersList.tsx
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGithub, faLinkedin } from "@fortawesome/free-brands-svg-icons";
import { faUserCircle, faCheck, faTimes, faTriangleExclamation, faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import LoadingState from "../../components/LoadingState";

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
  const [query, setQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const { isLoaded, isSignedIn } = useAuth();

  // 1) fetch current user's rollNo
  useEffect(() => {
    fetch("/api/members/me")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: { rollNo: string }) => setMyRollNo(data.rollNo))
      .catch(() => setMyRollNo(null));
  }, []);

  if (!isLoaded) {
    return <LoadingState message="Loading brothers..." />;
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

  const filtered = initialMembers
    .filter((m) => (filter === "All" ? true : m.status === filter))
    .filter((m) => {
      if (!query.trim()) return true;
      const haystack = `${m.rollNo} ${m.fName} ${m.lName} ${m.majors.join(" ")}`.toLowerCase();
      return haystack.includes(query.trim().toLowerCase());
    });

  const sorted = [...filtered].sort((a, b) => {
    const toNumber = (rollNo: string) => {
      const cleaned = rollNo.replace(/\D/g, "");
      const value = Number.parseInt(cleaned, 10);
      return Number.isNaN(value) ? Number.MAX_SAFE_INTEGER : value;
    };
    const aNum = toNumber(a.rollNo);
    const bNum = toNumber(b.rollNo);
    if (aNum !== bNum) return aNum - bNum;
    return a.rollNo.localeCompare(b.rollNo);
  });

  return (
    <div className="member-dashboard">
      <section className="bento-card admin-table-card brothers-hero">
        <div className="admin-members-header">
          <div>
            <h2>Brothers</h2>
            <p className="text-muted">Search through all brothers.</p>
          </div>
          <div className="brothers-controls">
            <select
              className="form-select w-auto"
              onChange={(e) => setFilter(e.target.value as any)}
              value={filter}
            >
              <option>All</option>
              <option>Active</option>
              <option>Alumni</option>
            </select>
            <button
              type="button"
              className="brothers-search__toggle"
              aria-label="Open search"
              onClick={() => setShowSearch((v) => !v)}
            >
              <FontAwesomeIcon icon={faMagnifyingGlass} />
            </button>
            <div className={`brothers-search${showSearch ? " is-open" : ""}`}>
              <input
                className="form-control"
                placeholder="Search brothers..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button
                  type="button"
                  className="brothers-search__clear"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="bento-card admin-table-card">
        <div className="row g-4">
          {sorted.map((m) => {
            const isMe = m.rollNo === myRollNo;
            const href = isMe
              ? `/member/profile/${m.rollNo}`
              : `/member/brothers/${m.rollNo}`;

            return (
              <div key={m.rollNo} className="col-sm-6 col-md-4 col-lg-3">
                <div className="card h-100">
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

          {sorted.length === 0 && (
            <p className="text-center text-muted">No members found.</p>
          )}
        </div>
      </section>
    </div>
  );
}
