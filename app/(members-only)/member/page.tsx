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
    return null;
  }

  if (!isSignedIn) {
    return <RedirectToSignIn />;
  }

  const { userHasProfile, type, isECouncil, isAdmin, needsPermissionReview, needsProfileReview } = userData;

  // Determine display text and color
  const userTypeColor = type === "Active" ? "text-primary" : type === "Alumni" ? "text-info" : "";
  const userTypeDetails = [
    isAdmin && "Admin",
    isECouncil && "E-Council",
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div>
      {/* Dashboard Body */}
      <div className="container mt-5">
        {user ? (
          <h1>
            Welcome, {user.firstName} {user.lastName}
          </h1>
        ) : (
          <h2>Welcome, please enter your name in your profile</h2>
        )}

        {/* Split into Two Columns */}
        <div className="row mt-4">
          <div className="col-md-6">
            <p>
              Type:{" "}
              <b className={userTypeColor}>
                {type}
                {userTypeDetails && <span> ({userTypeDetails})</span>}
              </b>
            </p>

            <div className="mt-3">
              {!userHasProfile ? (
                <div className="alert alert-warning d-flex align-items-center" role="alert">
                  <FontAwesomeIcon icon={faTriangleExclamation} className="me-2" />
                  Please set up your profile to gain privileges on the management tool.
                </div>
              ) : (
                <>
                  {needsPermissionReview && (
                    <div className="alert alert-info d-flex align-items-center mt-2" role="alert">
                      <FontAwesomeIcon icon={faHourglass} className="me-2" />
                      Since you marked yourself as E-Council, your status and profile are awaiting review from an admin.
                    </div>
                  )}

                  {(needsProfileReview && !needsPermissionReview) && (
                    <div className="alert alert-info d-flex align-items-center mt-2" role="alert">
                      <FontAwesomeIcon icon={faHourglass} className="me-2" />
                      Your profile changes have been queued for review by an admin and will be reviewed within a couple of days.
                    </div>
                  )}

                  {(!needsPermissionReview) && (
                    <div className="alert alert-success d-flex align-items-center" role="alert">
                      <FontAwesomeIcon icon={faCheck} className="me-2" />
                      Your profile is set up! You have regular privileges on the management tool.
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="col-md-6">
            <h4>My Accesses</h4>
            <table className="table">
              <thead className="table-light">
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
                      icon={isECouncil ? faCheck : faTimes}
                      className={isECouncil ? "text-success" : "text-danger"}
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
