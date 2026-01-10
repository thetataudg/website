"use client";

import React from "react";
import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faHourglass, faTimes } from "@fortawesome/free-solid-svg-icons";

export default function MinutesPage() {
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
    <div className="member-dashboard events-page">
      <section className="bento-card events-hero">
        <div>
          <div className="hero-eyebrow">Chapter Records</div>
          <h1 className="hero-title">Meeting Minutes</h1>
          <p className="hero-subtitle">
            There are currently no minutes available. Please reach out to the
            scribe for more details or check emails from{" "}
            <a href="mailto:scribe@thetatau-dg.org">scribe@thetatau-dg.org</a>.
          </p>
        </div>
      </section>
    </div>
  );
}
