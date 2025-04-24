"use client";

import React from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { RedirectToSignIn } from "@clerk/nextjs";

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

export default function Dashboard() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();

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

  // Determine display text and color
  const userTypeColor = type === "Active" ? "text-primary" : type === "Alumni" ? "text-info" : "";
  const userTypeDetails = [
    isAdmin && "Admin",
    isECouncil && "E-Council",
    needsPermissionReview && "access pending",
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="container-xxl mt-4">
      {/* Dashboard Body */}
      <div>
        {user ? (
          <h1>
            Welcome, {user.firstName}
          </h1>
        ) : (
          <h2>Welcome, please enter your name in your profile</h2>
        )}

        {/* Split into Two Columns */}
        <div className="row mt-4">
          <div className="col-md-8">
            <p>
              User Type:{" "}
              <b className={userTypeColor}>
                {type}
                {userTypeDetails && <span> ({userTypeDetails})</span>}
              </b>
            </p>

            <div className="mt-3">
              {!userHasProfile ? (
                <div>
                  <div className="alert alert-warning d-flex align-items-center" role="alert">
                    <FontAwesomeIcon icon={faTriangleExclamation} className="me-2" />
                    Please set up your profile to gain privileges on the management tool.
                  </div>

                    <a type="button" className="btn btn-success" href="/member/onboard">
                      Setup Profile
                    </a>
                  </div>
              ) : (
                <>
                  {needsPermissionReview && (
                    <div className="alert alert-info d-flex align-items-center mt-2" role="alert">
                      <FontAwesomeIcon icon={faHourglass} className="me-2" />
                      Since you marked yourself as E-Council, your extended permissions are being verified.
                    </div>
                  )}

                  {(needsProfileReview && !needsPermissionReview) && (
                    <div className="alert alert-info d-flex align-items-center mt-2" role="alert">
                      <FontAwesomeIcon icon={faHourglass} className="me-2" />
                      Your profile changes are awaiting review.
                    </div>
                  )}

                  <div className="alert alert-success d-flex align-items-center" role="alert">
                    <FontAwesomeIcon icon={faCheck} className="me-2" />
                    Your profile is active, giving you normal privileges on the chapter tool.
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="col-md-4">
            <h4>My Accesses</h4>
            <table className="table">
              <thead className="thead-dark">
                <tr>
                  <th>Privilege</th>
                  <th className="text-center">Access</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Edit Profile</td>
                  <td className="text-center">
                    <FontAwesomeIcon
                      icon={userHasProfile ? faCheck : faTimes}
                      className={userHasProfile ? "text-success" : "text-danger"}
                    />
                  </td>
                </tr>
                <tr>
                  <td>Brother Directory</td>
                  <td className="text-center">
                    <FontAwesomeIcon
                      icon={userHasProfile ? faCheck : faTimes}
                      className={userHasProfile ? "text-success" : "text-danger"}
                    />
                  </td>
                </tr>
                <tr>
                  <td>Minutes</td>
                  <td className="text-center">
                    <FontAwesomeIcon icon={faCheck} className="text-success" />
                  </td>
                </tr>
                <tr>
                  <td>Vote</td>
                  <td className="text-center">
                    <FontAwesomeIcon
                      icon={(userHasProfile && type === "Active") ? faCheck : faTimes}
                      className={(userHasProfile && type === "Active") ? "text-success" : "text-danger"}
                    />
                  </td>
                </tr>
                <tr>
                  <td>Admin Voting</td>
                  <td className="text-center">
                    <FontAwesomeIcon
                      icon={(isECouncil && !needsPermissionReview) ? faCheck : faTimes}
                      className={(isECouncil && !needsPermissionReview) ? "text-success" : "text-danger"}
                    />
                  </td>
                </tr>
                <tr>
                  <td>Events</td>
                  <td className="text-center">
                    <FontAwesomeIcon icon={faCheck} className="text-success" />
                  </td>
                </tr>
                <tr>
                  <td>Admin Users</td>
                  <td className="text-center">
                    <FontAwesomeIcon
                      icon={isAdmin ? faCheck : faTimes}
                      className={isAdmin ? "text-success" : "text-danger"}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
