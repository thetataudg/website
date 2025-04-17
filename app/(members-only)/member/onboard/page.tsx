"use client";

import React, { useState, useEffect } from "react";
import { RedirectToSignIn, SignInButton, useAuth, useUser } from "@clerk/nextjs";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faWarning, faTimes, faHourglass } from "@fortawesome/free-solid-svg-icons";

// Check if user already has entry in MongoDB here
const userHasEntryInDB = false;

export default function MemberOnboard() {
  const { isLoaded, isSignedIn } = useAuth();
  const [authError, setAuthError] = useState(false);
  const [isElected, setIsElected] = useState(false);

  const engineeringMajors = [
    "Computer Science",
    "Mechanical Engineering",
    "Electrical Engineering",
    "Civil Engineering",
    "Biomedical Engineering",
  ];
  const littleOptions = ["Little A", "Little B", "Little C"];
  const eCouncilPositions = [
    "Regent",
    "Vice Regent",
    "Treasurer",
    "Scribe",
    "Corresponding Secretary",
  ];
  const fraternityStatuses = ["Active", "Alumni"];

  const handleSubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {};
    formData.forEach((value, key) => {
      if (key === "majors" || key === "little") {
        data[key] = formData.getAll(key);
      } else {
        data[key] = value;
      }
    });

    try {
      const response = await fetch("/api/create-member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        alert("Profile created successfully!");
      } else {
        alert("Failed to create profile. Please try again.");
      }
    } catch (error) {
      alert("An error occurred. Please try again.");
    }
  };

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
            <FontAwesomeIcon icon={faTimes} className="h3" />
            <h3>You must be logged into use this function.</h3>
            <RedirectToSignIn />
            </div>
        </div>
    );
  }

  if (userHasEntryInDB) {
    return (
        <div className="container">
            <div className="alert alert-warning d-flex align-items-center mt-5" role="alert">
            <FontAwesomeIcon icon={faWarning} className="p" />
            You already have a profile, use the My Profile function to adjust your profile instead.
            </div>
        </div>
    );
  }

  const { user } = useUser();

  return (
    <>
      <div className="container">
        <form className="p-4" onSubmit={handleSubmit}>
          <h1>User Onboarding</h1>
          <p>Thanks for setting up your account. Provide the following information to complete your profile.</p>

          <div className="mb-3">
            <label className="form-label fw-bold" htmlFor="fname">First Name</label>
            <input type="text" id="fname" name="fname" value={user?.firstName || ""} readOnly className="form-control" />
          </div>
          <div className="mb-3">
            <label className="form-label fw-bold" htmlFor="lname">Last Name</label>
            <input type="text" id="lname" name="lname" value={user?.lastName || ""} readOnly className="form-control" />
          </div>
          <div className="mb-3">
            <label className="form-label fw-bold" htmlFor="fraternityStatus">Fraternity Status</label>
            <select id="fraternityStatus" name="fraternityStatus" className="form-select">
              {fraternityStatuses.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>
          <div className="mb-3">
            <label className="form-label fw-bold" htmlFor="rollNumber">Roll Number</label>
            <input type="number" id="rollNumber" name="rollNumber" className="form-control" />
          </div>
          <div className="mb-3">
            <label className="form-label fw-bold" htmlFor="majors">Majors</label>
            <select multiple id="majors" name="majors" className="form-select">
              {engineeringMajors.map((major) => (
                <option key={major} value={major}>{major}</option>
              ))}
            </select>
          </div>
          <div className="mb-3">
            <label className="form-label fw-bold" htmlFor="graduationYear">Graduation Year</label>
            <input type="number" id="graduationYear" name="graduationYear" className="form-control" />
          </div>
          <div className="mb-3">
            <label className="form-label fw-bold" htmlFor="big">Big</label>
            <input type="text" id="big" name="big" className="form-control" />
          </div>
          <div className="mb-3">
            <label className="form-label fw-bold" htmlFor="little">Little</label>
            <select multiple id="little" name="little" className="form-select">
              {littleOptions.map((little) => (
                <option key={little} value={little}>{little}</option>
              ))}
            </select>
          </div>
          <div className="mb-3">
            <label className="form-label fw-bold" htmlFor="familyLine">Family Line</label>
            <input type="text" id="familyLine" name="familyLine" className="form-control" />
          </div>
          <div className="mb-3">
            <label className="form-label fw-bold" htmlFor="resumeUrl">Resume URL</label>
            <input type="url" id="resumeUrl" name="resumeUrl" className="form-control" />
          </div>
          <div className="mb-3">
            <label className="form-label fw-bold" htmlFor="pledgeClass">Pledge Class</label>
            <input type="text" id="pledgeClass" name="pledgeClass" className="form-control" />
          </div>
          <div className="form-check mb-3">
            <input
              type="checkbox"
              id="isElected"
              name="isElected"
              className="form-check-input"
              checked={isElected}
              onChange={(e) => setIsElected(e.target.checked)}
            />
            <label className="form-check-label fw-bold" htmlFor="isElected">
              Current e-Council?
            </label>
          </div>
          {isElected && (
            <div className="mb-3">
              <label className="form-label fw-bold" htmlFor="eCouncilPosition">Current e-Council Position</label>
              <select id="eCouncilPosition" name="eCouncilPosition" className="form-select">
                {eCouncilPositions.map((position) => (
                  <option key={position} value={position}>{position}</option>
                ))}
              </select>
            </div>
          )}
          <div className="mb-3">
            <label className="form-label fw-bold" htmlFor="committeePositions">Committee Positions</label>
            <input type="text" id="committeePositions" name="committeePositions" className="form-control" />
          </div>
          <div className="mb-3">
            <label className="form-label fw-bold" htmlFor="linkedinLink">LinkedIn Link</label>
            <input type="url" id="linkedinLink" name="linkedinLink" className="form-control" />
          </div>
          <div className="mb-3">
            <label className="form-label fw-bold" htmlFor="githubLink">GitHub Link</label>
            <input type="url" id="githubLink" name="githubLink" className="form-control" />
          </div>
          <button type="submit" className="btn btn-success">
            Submit
          </button>
        </form>
      </div>
    </>
  );
}
