"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHome,
  faUser,
  faAddressCard,
  faNoteSticky,
  faCheckToSlot,
  faCalendar,
  faGear,
  faShop,
} from "@fortawesome/free-solid-svg-icons";

export default function MemberNavbar() {
  const pathname = usePathname();
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

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
        
        setUserData({
          rollNo: data.rollNo,
          role: data.role
        });
      } catch (error) {
        console.error("Navbar: Fetch error:", error);
        setUserData({ rollNo: null, role: null });
      } finally {
        setLoading(false);
      }
    };
    
    fetchUserData();
  }, [mounted]);

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
    return href !== "/" && pathname.startsWith(href);
  };

  console.log("Navbar: Rendering - mounted:", mounted, "pathname:", pathname);

  // Don't render nav items until mounted (prevents hydration mismatch)
  if (!mounted) {
    return (
      <nav 
        style={{backgroundColor: "rgb(173, 40, 49)"}} 
        className="navbar navbar-expand-lg navbar-dark"
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
    <nav 
      style={{backgroundColor: "rgb(173, 40, 49)"}} 
      className="navbar navbar-expand-lg navbar-dark"
    >
      <div className="container-fluid">
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
          <ul className="navbar-nav me-auto mb-2 mb-lg-0">
            <li className="nav-item">
              <Link
                className={`nav-link ${isActive("/member") ? "active" : ""}`}
                href="/member"
              >
                <FontAwesomeIcon icon={faHome} className="me-1" /> Home
              </Link>
            </li>

            {userData && (
              <li className="nav-item">
                <Link
                  className={`nav-link ${
                    isActive("/member/profile") ? "active" : ""
                  }`}
                  href={userData.rollNo ? `/member/profile/${userData.rollNo}` : "/member/profile"}
                >
                  <FontAwesomeIcon icon={faUser} className="me-1" /> My Profile
                </Link>
              </li>
            )}

            {userData && (userData.role === "admin" || userData.role === "superadmin") && (
              <li className="nav-item">
                <Link
                  className={`nav-link ${
                    isActive("/member/admin") ? "active" : ""
                  }`}
                  href="/member/admin"
                >
                  <FontAwesomeIcon icon={faGear} className="me-1" /> Admin
                </Link>
              </li>
            )}

            <li className="nav-item">
              <Link
                className={`nav-link ${
                  isActive("/member/brothers") ? "active" : ""
                }`}
                href="/member/brothers"
              >
                <FontAwesomeIcon icon={faAddressCard} className="me-1" /> Brothers
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
                className="dropdown-menu dropdown-menu-dark"
                aria-labelledby="moreDropdown"
              >
                <li>
                  <Link
                    className={`dropdown-item ${
                      isActive("/member/minutes") ? "active" : ""
                    }`}
                    href="/member/minutes"
                  >
                    Minutes
                  </Link>
                </li>
                <li>
                  <Link
                    className={`dropdown-item ${
                      isActive("/member/vote") ? "active" : ""
                    }`}
                    href="/member/vote"
                  >
                    Voting
                  </Link>
                </li>
                <li>
                  <Link
                    className={`dropdown-item ${
                      isActive("/member/events") ? "active" : ""
                    }`}
                    href="/member/events"
                  >
                    Events
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