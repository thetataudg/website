"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUser,
  faAddressCard,
  faNoteSticky,
  faCheckToSlot,
  faCalendar,
  faGear,
  faHome,
  faShop,
} from "@fortawesome/free-solid-svg-icons";

import { useEffect } from "react";

export default function MemberNavbar() {
  const pathname = usePathname();

  const isActive = (href) => pathname === href;

  useEffect(() => {
    const loadBootstrap = async () => {
      try {
        await import("bootstrap/dist/js/bootstrap.bundle.min.js");
        console.log("Bootstrap JS loaded successfully");
      } catch (error) {
        console.error("Failed to load Bootstrap JS", error);
      }
    };

    loadBootstrap();
  }, []); // Empty dependency array ensures it runs once when the component mounts

  return (
    <nav className="navbar navbar-expand-lg navbar-dark bg-dark">
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
            <li className="nav-item">
              <Link
                className={`nav-link ${isActive("/member/profile") ? "active" : ""}`}
                href="/member/profile"
              >
                <FontAwesomeIcon icon={faUser} className="me-1" /> My Profile
              </Link>
            </li>
            <li className="nav-item">
              <Link
                className={`nav-link ${isActive("/member/brothers") ? "active" : ""}`}
                href="/member/brothers"
              >
                <FontAwesomeIcon icon={faAddressCard} className="me-1" /> Brothers
              </Link>
            </li>
            <li className="nav-item">
              <Link
                className={`nav-link ${isActive("/member/minutes") ? "active" : ""}`}
                href="/member/minutes"
              >
                <FontAwesomeIcon icon={faNoteSticky} className="me-1" /> Minutes
              </Link>
            </li>
            <li className="nav-item">
              <Link
                className={`nav-link ${isActive("/member/vote") ? "active" : ""}`}
                href="/member/vote"
              >
                <FontAwesomeIcon icon={faCheckToSlot} className="me-1" /> Vote
              </Link>
            </li>
            <li className="nav-item">
              <Link
                className={`nav-link ${isActive("/member/events") ? "active" : ""}`}
                href="/member/events"
              >
                <FontAwesomeIcon icon={faCalendar} className="me-1" /> Events
              </Link>
            </li>
            <li className="nav-item">
              <Link className="nav-link" target="_blank" href="https://thetatau-dg.org/2dg4u">
                <FontAwesomeIcon icon={faShop} className="me-1" /> Merchandise
              </Link>
            </li>
          </ul>
          <ul className="navbar-nav ms-auto">
            <li className="nav-item me-2">
              <Link
                className={`nav-link ${isActive("/member/admin") ? "active" : ""}`}
                href="/member/admin"
              >
                <FontAwesomeIcon icon={faGear} className="me-1" /> Admin
              </Link>
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
