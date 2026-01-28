"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import ThemeToggle from "./ThemeToggle";

export default function MemberNavbar() {
  const pathname = usePathname();
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [isCommitteeHead, setIsCommitteeHead] = useState(false);
  const [hasCommitteeMembership, setHasCommitteeMembership] = useState(false);

  // Force client-side mounting
  useEffect(() => {
    setMounted(true);
    console.log("Navbar: Component mounted");
  }, []);

  // fetch current user's rollNo & role
  useEffect(() => {
    if (!mounted) return;

    const fetchUserData = async () => {
      try {
        const res = await fetch("/api/members/me");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        console.log("Navbar: Fetch success:", data);
        const isPending = Boolean(data.pending);

        setUserData({
          rollNo: data.rollNo,
          role: data.role,
          isCommitteeHead: data.isCommitteeHead,
          memberId: data.memberId,
          isECouncil: data.isECouncil,
          status: data.status || (isPending ? "Pending" : undefined),
          needsProfileReview: data.needsProfileReview ?? false,
          needsPermissionReview: data.needsPermissionReview ?? false,
          pending: isPending,
          pendingStatus: data.pendingStatus,
        });
      } catch (error) {
        console.error("Navbar: Fetch error:", error);
        setUserData({
          rollNo: null,
          role: null,
          isCommitteeHead: false,
          memberId: null,
          isECouncil: false,
          pending: true,
        });
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [mounted]);

  useEffect(() => {
    if (!mounted || !userData?.memberId) return;
    const loadCommitteeHead = async () => {
      try {
        const res = await fetch(`/api/committees?memberId=${encodeURIComponent(userData.memberId)}`);
        if (!res.ok) return;
        const committees = await res.json();
        const isHead = committees.some((c) => {
          const headId =
            typeof c.committeeHeadId === "string"
              ? c.committeeHeadId
              : c.committeeHeadId?._id;
          return headId === userData.memberId;
        });
        setIsCommitteeHead(isHead);
        setHasCommitteeMembership(Array.isArray(committees) && committees.length > 0);
      } catch (error) {
        console.error("Navbar: Committee head check failed:", error);
      }
    };
    loadCommitteeHead();
  }, [mounted, userData?.memberId]);

  // load Bootstrap's JS for mobile toggler
  useEffect(() => {
    if (!mounted) return;

    const loadBootstrap = async () => {
      try {
        await import("bootstrap/dist/js/bootstrap.bundle.min.js");
        console.log("Navbar: Bootstrap loaded");
      } catch (error) {
        console.error("Navbar: Failed to load Bootstrap JS:", error);
      }
    };
    loadBootstrap();
  }, [mounted]);

  const isActive = (href) => {
    if (href === "/member") {
      return pathname === "/member";
    }
    if (href === "/member/events") {
      return pathname === "/member/events";
    }
    return href !== "/" && pathname.startsWith(href);
  };

  console.log("Navbar: Rendering - mounted:", mounted, "pathname:", pathname);

  const isWaiting =
    !userData ||
    userData.pending ||
    userData.needsPermissionReview ||
    userData.needsProfileReview;

  const handleMainSiteClick = useCallback(() => {
    if (typeof window === "undefined") return;
    const url = "/";
    const newTab = window.open(url, "_blank");
    if (newTab) {
      newTab.focus();
      setTimeout(() => {
        try {
          newTab.location.reload();
        } catch (err) {
          console.error("Navbar: Unable to reload main site tab", err);
        }
      }, 600);
    }
  }, []);

  const canSeeCommitteeEvents =
    userData &&
    (userData.role === "admin" ||
      userData.role === "superadmin" ||
      userData.isECouncil ||
      userData.isCommitteeHead ||
      isCommitteeHead);
  const canSeeManageEvents =
    userData &&
    (userData.role === "admin" ||
      userData.role === "superadmin" ||
      userData.isECouncil);
  const canSeeGem = Boolean(userData?.memberId);
  const showEventsDropdown = canSeeCommitteeEvents || canSeeManageEvents;

  // Don't render nav items until mounted (prevents hydration mismatch)
  if (!mounted) {
    return (
      <nav
        // style={{backgroundColor: "rgb(173, 40, 49)"}} 
        className="navbar navbar-expand-lg navbar-dark bg-dark"
      >
        <div className="container-fluid">
          <Link className="navbar-brand" href="/member">
            ΔΓ Chapter Tools
          </Link>
          <div className="collapse navbar-collapse">
            <ul className="navbar-nav me-auto">
              <li className="nav-item">
                <span className="nav-link text-light">Initializing...</span>
              </li>
            </ul>
            <ul className="navbar-nav ms-auto">
              <li className="nav-item d-flex align-items-center">
                <UserButton />
              </li>
            </ul>
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav className="members-navbar navbar navbar-expand-lg">
      <div className="container-fluid members-navbar__inner">
        <Link className="navbar-brand" href="/member">
          ΔΓ Chapter Tools
        </Link>
        <button
          className="navbar-toggler"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#navbarNav"
          aria-controls="navbarNav"
          aria-expanded="false"
          aria-label="Toggle navigation"
        >
          <span className="navbar-toggler-icon"></span>
        </button>

        <div className="collapse navbar-collapse" id="navbarNav">
          <ul className="navbar-nav mx-auto mb-2 mb-lg-0 members-navbar__menu">
            <li className="nav-item">
              <Link
                className={`nav-link ${isActive("/member") ? "active" : ""}`}
                href="/member"
              >
                Home
              </Link>
            </li>

            {!isWaiting && (
              <>
                {userData && (
                  <li className="nav-item">
                    <Link
                      className={`nav-link ${isActive("/member/profile") ? "active" : ""
                        }`}
                      href={userData.rollNo ? `/member/profile/${userData.rollNo}` : "/member/profile"}
                    >
                      My Profile
                    </Link>
                  </li>
                )}

                {userData && (userData.role === "admin" || userData.role === "superadmin") && (
                  <li className="nav-item">
                    <Link
                      className={`nav-link ${isActive("/member/admin") ? "active" : ""
                        }`}
                      href="/member/admin"
                    >
                      Admin
                    </Link>
                  </li>
                )}

                <li className="nav-item">
                  <Link
                    className={`nav-link ${isActive("/member/brothers") ? "active" : ""
                      }`}
                    href="/member/brothers"
                  >
                    Brothers
                  </Link>
                </li>

                <li className="nav-item">
                  <Link
                    className={`nav-link ${isActive("/member/vote") ? "active" : ""
                      }`}
                    href="/member/vote"
                  >
                    Vote
                  </Link>
                </li>

                {showEventsDropdown ? (
                  <li className="nav-item dropdown">
                    <a
                      className={`nav-link dropdown-toggle ${isActive("/member/events") ? "active" : ""
                        }`}
                      href="#"
                      id="eventsDropdown"
                      role="button"
                      data-bs-toggle="dropdown"
                      aria-expanded="false"
                    >
                      Events
                    </a>
                    <ul className="dropdown-menu" aria-labelledby="eventsDropdown">
                      <li>
                        <Link
                          className={`dropdown-item ${isActive("/member/events") ? "active" : ""
                            }`}
                          href="/member/events"
                        >
                          All Events
                        </Link>
                      </li>
                      {canSeeManageEvents && (
                        <li>
                          <Link
                            className={`dropdown-item ${isActive("/member/events/manage") ? "active" : ""
                              }`}
                            href="/member/events/manage"
                          >
                            Manage Events
                          </Link>
                        </li>
                      )}
                      {canSeeCommitteeEvents && (
                        <li>
                          <Link
                            className={`dropdown-item ${isActive("/member/events/committee") ? "active" : ""
                              }`}
                            href="/member/events/committee"
                          >
                            Committee Events
                          </Link>
                        </li>
                      )}
                    </ul>
                  </li>
                ) : (
                  <li className="nav-item">
                    <Link
                      className={`nav-link ${isActive("/member/events") ? "active" : ""
                        }`}
                      href="/member/events"
                    >
                      Events
                    </Link>
                  </li>
                )}

                {canSeeGem && (
                  <li className="nav-item">
                    <Link
                      className={`nav-link ${isActive("/member/gem") ? "active" : ""}`}
                      href="/member/gem"
                    >
                      GEM
                    </Link>
                  </li>
                )}

                <li className="nav-item">
                  <Link
                    className={`nav-link ${isActive("/member/committees") ? "active" : ""}`}
                    href="/member/committees"
                  >
                    Committees
                  </Link>
                </li>

                <li className="nav-item">
                  <Link
                    className={`nav-link ${isActive("/member/minutes") ? "active" : ""
                      }`}
                    href="/member/minutes"
                  >
                    Minutes
                  </Link>
                </li>

                <li className="nav-item dropdown">
                  <a
                    className="nav-link dropdown-toggle"
                    href="#"
                    id="moreDropdown"
                    role="button"
                    data-bs-toggle="dropdown"
                    aria-expanded="false"
                  >
                    More
                  </a>
                  <ul
                    className="dropdown-menu"
                    aria-labelledby="moreDropdown"
                  >
                    <li>
                      <Link
                        className="dropdown-item"
                        href="#"
                      >
                        Coming Soon
                      </Link>
                    </li>
                    <li>
                      <hr className="dropdown-divider" />
                    </li>
                    <li>
                      <Link
                        className="dropdown-item"
                        target="_blank"
                        href="https://thetatau-dg.org/2dg4u"
                      >
                        Merchandise
                      </Link>
                    </li>
                  </ul>
                </li>
              </>
            )}
          </ul>

          <ul className="navbar-nav ms-auto members-navbar__actions">
            <li className="nav-item d-flex align-items-center me-2">
              <button
                type="button"
                className="btn btn-outline-light btn-sm main-site-link"
                onClick={handleMainSiteClick}
              >
                Main Site
              </button>
            </li>
            <li className="nav-item">
              <ThemeToggle />
            </li>
            <li className="nav-item d-flex align-items-center">
              <UserButton />
            </li>
          </ul>
        </div>
      </div>
    </nav>
  );
}
