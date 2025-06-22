"use client";

import React from "react";
import { RedirectToSignIn, useAuth, useUser } from "@clerk/nextjs";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faTimes, faTriangleExclamation, faHourglass } from "@fortawesome/free-solid-svg-icons";

// Grab this information from the user's MongoDB entry (if there is one)
const userData = {
  userHasProfile: true, // Create userData but set this to false if the user is not found in MongoDB
  needsProfileReview: false,
  needsPermissionReview: false,
  type: "Active", // enum ["Active", "Alumni", "Removed", "Deceased"]
  isECouncil: false,
  isAdmin: false,
};

export default function VotePage() {
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

  const { userHasProfile, type, isECouncil, isAdmin, needsPermissionReview, needsProfileReview } = userData;

  return (
    <div className="container-xxl mt-4">
      <div>
            <h1>
                Chapter Voting
            </h1>
            
            <div className="alert alert-primary d-flex align-items-center" role="alert">
              <FontAwesomeIcon icon={faTriangleExclamation} className="me-2" />
              There are no currently no votes running.
            </div>
        </div>
    </div>
  );
}
