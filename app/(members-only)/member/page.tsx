// Delta Gamma Chapter Management Dashboard
// Requirements: React, Clerk, Bootstrap 5, Font Awesome
// Place this in a file like Dashboard.js and ensure ClerkProvider wraps your app

"use client";

import React from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { RedirectToSignIn, SignInButton } from "@clerk/nextjs";

export default function Dashboard() {
  const { isLoaded, isSignedIn } = useAuth();

  const { user } = useUser();

  if (!isLoaded) {
    return null;
  }

  if (!isSignedIn) {
    return <RedirectToSignIn />;
  }

  return (
    <div>
      {/* Dashboard Body */}
      <div className="container mt-5">
        <h2>
          Welcome, {user.firstName} {user.lastName}
        </h2>
        <p>
          User Status: <b>Active</b>
        </p>

        {/* User Privileges Table */}
        <div className="mt-4">
          <h4>User Privileges</h4>
          <table className="table table-bordered table-striped w-auto">
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
                  <i className="fa fa-check text-success"></i>
                </td>
              </tr>
              <tr>
                <td>Brother Directory</td>
                <td className="text-center">
                  <i className="fa fa-check text-success"></i>
                </td>
              </tr>
              <tr>
                <td>Minutes</td>
                <td className="text-center">
                  <i className="fa fa-check text-success"></i>
                </td>
              </tr>
              <tr>
                <td>Vote</td>
                <td className="text-center">
                  <i className="fa fa-check text-success"></i>
                </td>
              </tr>
              <tr>
                <td>Events</td>
                <td className="text-center">
                  <i className="fa fa-check text-success"></i>
                </td>
              </tr>
              <tr>
                <td>Admin</td>
                <td className="text-center">
                  <i className="fa fa-times text-danger"></i>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}