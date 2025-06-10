"use client";

import React, { useEffect, useState } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { RedirectToSignIn } from "@clerk/nextjs";
import axios from "axios";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheck,
  faTimes,
  faTriangleExclamation,
  faHourglass,
} from "@fortawesome/free-solid-svg-icons";

export default function Dashboard() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();

  const [userData, setUserData] = useState({
    userHasProfile: false,
    needsProfileReview: false,
    needsPermissionReview: false,
    type: "Active",
    isECouncil: false,
    isAdmin: false,
  });

  const [loadingUserData, setLoadingUserData] = useState(true);

  useEffect(() => {
    async function fetchUserData() {
      try {
        const response = await axios.get("/api/members/me");
        const data = response.data;

        setUserData({
          userHasProfile: true,
          needsProfileReview: false,
          needsPermissionReview: false,
          type: "Active",
          isECouncil: false,
          isAdmin: data.role === "admin" || data.role === "superadmin",
        });
      } catch (error) {
        console.error("Error fetching user data:", error);
        setUserData({
          userHasProfile: false,
          needsProfileReview: false,
          needsPermissionReview: false,
          type: "Active",
          isECouncil: false,
          isAdmin: false,
        });
      } finally {
        setLoadingUserData(false);
      }
    }

    if (isSignedIn) fetchUserData();
  }, [isSignedIn]);

  if (!isLoaded || loadingUserData) {
    return (
      <div className="container">
        <div
          className="alert alert-info d-flex align-items-center mt-5"
          role="alert"
        >
          <FontAwesomeIcon icon={faHourglass} className="h2" />
          <h2>Loading...</h2>
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="container">
        <div
          className="alert alert-danger d-flex align-items-center mt-5"
          role="alert"
        >
          <FontAwesomeIcon icon={faTimes} className="h2" />
          <h3>You must be logged in to use this function.</h3>
          <RedirectToSignIn />
        </div>
      </div>
    );
  }

  const {
    userHasProfile,
    type,
    isECouncil,
    isAdmin,
    needsPermissionReview,
    needsProfileReview,
  } = userData;

  const userTypeColor =
    type === "Active" ? "text-primary" : type === "Alumni" ? "text-info" : "";
  const userTypeDetails = [
    isAdmin && "Admin",
    isECouncil && "E-Council",
    needsPermissionReview && "access pending",
  ]
    .filter(Boolean)
    .join(", ");

  const privileges = [
    { label: "Edit Profile", access: userHasProfile },
    { label: "Brother Directory", access: userHasProfile },
    { label: "Minutes", access: userHasProfile },
    { label: "Vote", access: userHasProfile && type === "Active" },
    { label: "Admin Voting", access: isAdmin },
    { label: "Events", access: userHasProfile },
    { label: "Admin Users", access: isAdmin },
  ];

  return (
    <div className="container-xxl mt-4">
      <div>
        {user ? (
          <h1>Welcome, {user.firstName}</h1>
        ) : (
          <h2>Welcome, please enter your name in your profile</h2>
        )}

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
                  <div
                    className="alert alert-warning d-flex align-items-center"
                    role="alert"
                  >
                    <FontAwesomeIcon
                      icon={faTriangleExclamation}
                      className="me-2"
                    />
                    You do not have access to this tool yet. Please contact an
                    admin if you believe this is an error.
                  </div>
                </div>
              ) : (
                <>
                  {needsPermissionReview && (
                    <div
                      className="alert alert-info d-flex align-items-center mt-2"
                      role="alert"
                    >
                      <FontAwesomeIcon icon={faHourglass} className="me-2" />
                      Since you marked yourself as E-Council, your extended
                      permissions are being verified.
                    </div>
                  )}

                  {needsProfileReview && !needsPermissionReview && (
                    <div
                      className="alert alert-info d-flex align-items-center mt-2"
                      role="alert"
                    >
                      <FontAwesomeIcon icon={faHourglass} className="me-2" />
                      Your profile changes are awaiting review.
                    </div>
                  )}

                  <div
                    className="alert alert-success d-flex align-items-center"
                    role="alert"
                  >
                    <FontAwesomeIcon icon={faCheck} className="me-2" />
                    {`Your profile is ${
                      type === "Active" ? "active" : type.toLowerCase()
                    }, granting ${
                      isAdmin
                        ? "admin privileges"
                        : isECouncil
                        ? "extended privileges"
                        : "normal privileges"
                    } on the chapter tool.`}
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
                {privileges.map((priv, index) => (
                  <tr key={index}>
                    <td>{priv.label}</td>
                    <td className="text-center">
                      <FontAwesomeIcon
                        icon={priv.access ? faCheck : faTimes}
                        className={priv.access ? "text-success" : "text-danger"}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
