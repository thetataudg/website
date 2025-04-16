"use client";

import React from "react";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";

// Make sure Bootstrap and Font Awesome CSS are globally loaded in your layout

export default function MemberNavbar() {
  return (
    <nav className="navbar navbar-expand-lg navbar-dark bg-primary">
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
              <Link className="nav-link" href="/member/profile">
                <i className="fa fa-user me-1"></i> My Profile
              </Link>
            </li>
            <li className="nav-item">
              <Link className="nav-link" href="/member/brothers">
                <i className="fa fa-address-card me-1"></i> Brothers
              </Link>
            </li>
            <li className="nav-item">
              <Link className="nav-link" href="/member/minutes">
                <i className="fa fa-note-sticky me-1"></i> Minutes
              </Link>
            </li>
            <li className="nav-item">
              <Link className="nav-link" href="/member/vote">
                <i className="fa fa-check-to-slot me-1"></i> Vote
              </Link>
            </li>
            <li className="nav-item">
              <Link className="nav-link" href="/member/events">
                <i className="fa fa-calendar me-1"></i> Events
              </Link>
            </li>
          </ul>
          <ul className="navbar-nav ms-auto">
            <li className="nav-item me-2">
              <Link className="nav-link" href="/member/admin">
                <i className="fa fa-gear"></i> Admin
              </Link>
            </li>
            <li className="nav-item">
              <UserButton />
            </li>
          </ul>
        </div>
      </div>
    </nav>
  );
}
