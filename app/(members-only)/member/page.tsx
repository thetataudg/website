"use client";

import React, { useEffect, useState } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { RedirectToSignIn } from "@clerk/nextjs";
import axios from "axios";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheck,
  faTimes,
  faTriangleExclamation,
  faHourglass,
  faUser,
  faAddressCard,
  faNoteSticky,
  faCheckToSlot,
  faCalendar,
  faGear,
  faUsersCog,
} from "@fortawesome/free-solid-svg-icons";

export default function Dashboard() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();

  const [userData, setUserData] = useState<any>(null);

  const [loadingUserData, setLoadingUserData] = useState(true);

  useEffect(() => {
    async function fetchUserData() {
      try {
        const response = await axios.get("/api/members/me");
        const data = response.data;

        console.log("API /api/members/me response:", data);

        setUserData({
          userHasProfile: true,
          needsProfileReview: data.needsProfileReview,
          needsPermissionReview: data.needsPermissionReview,
          type: data.status, // Use the real status from API
          isECouncil: data.isECouncil,
          isAdmin: data.role === "admin" || data.role === "superadmin",
          rollNo: data.rollNo,
        });

      } catch (error) {
        console.error("Error fetching user data:", error);
        setUserData(null);
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


  if (!userData || !userData.type) {
    // All accesses are false for unapproved users
    const privileges = [
      { label: "Edit Profile", access: false },
      { label: "Directory", access: true },
      { label: "Minutes", access: false },
      { label: "Vote", access: false },
      { label: "Admin Voting", access: false },
      { label: "Events", access: false },
      { label: "Admin Users", access: false },
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
                <b className="text-dark">
                  Pending
                </b>
              </p>

              <div className="mt-3">
                  <div>
                    <div
                      className="alert alert-primary d-flex align-items-center"
                      role="alert"
                    >
                      <FontAwesomeIcon
                        icon={faHourglass}
                        className="me-2"
                      />
                      Your profile is not yet approved. Please contact an
                      officer if you believe this is an error.
                    </div>
                  </div>
              </div>
            </div>

            <div className="col-md-4">
              <h4>My Permissions</h4>
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

  const {
    userHasProfile,
    type,
    isECouncil,
    isAdmin,
    needsPermissionReview,
    needsProfileReview,
    rollNo,
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
    { label: "Directory", access: true },
    { label: "Minutes", access: userHasProfile },
    { label: "Vote", access: userHasProfile && type === "Active" },
    { label: "Admin Voting", access: isECouncil },
    { label: "Events", access: userHasProfile },
    { label: "Admin Users", access: isAdmin },
  ];

  // Quick access buttons
  const quickAccessButtons = [
    {
      label: "My Profile",
      href: rollNo ? `/member/profile/${rollNo}` : "#",
      icon: faUser,
      enabled: userHasProfile,
      variant: "primary",
    },
    {
      label: "Brothers",
      href: "/member/brothers",
      icon: faAddressCard,
      enabled: userHasProfile,
      variant: "success",
    },
    // {
    //   label: "Minutes",
    //   href: "/member/minutes",
    //   icon: faNoteSticky,
    //   enabled: userHasProfile,
    //   variant: "info",
    // },
    {
      label: "Vote",
      href: "/member/vote",
      icon: faCheckToSlot,
      enabled: userHasProfile && type === "Active",
      variant: "warning",
    },
    // {
    //   label: "Events",
    //   href: "/member/events",
    //   icon: faCalendar,
    //   enabled: userHasProfile,
    //   variant: "secondary",
    // },
    {
      label: "Admin",
      href: "/member/admin",
      icon: faGear,
      enabled: isAdmin,
      variant: "danger",
    },
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

                  {/* Instant Access Buttons */}
                  <div className="mt-4">
                    <h4>Quick Access</h4>
                    <div className="row g-3">
                      {quickAccessButtons
                        .filter(button => button.enabled)
                        .map((button, index) => (
                          <div className="col-sm-6 col-md-4" key={index}>
                            <Link
                              href={button.href}
                              className={`btn btn-${button.variant} w-100 d-flex align-items-center justify-content-center`}
                              style={{ minHeight: "50px" }}
                            >
                              <FontAwesomeIcon icon={button.icon} className="me-2" />
                              {button.label}
                            </Link>
                          </div>
                        ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="col-md-4">
            <h4>Permissions</h4>
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