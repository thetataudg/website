"use client";

import React, { useState } from "react";
import { SignInButton, useAuth, useUser } from "@clerk/nextjs";
import { useEffect } from "react";

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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    // Construct an object from the form data
    const data: Record<string, any> = {};
    formData.forEach((value, key) => {
      if (key === "majors" || key === "little") {
        // Handle multi-select inputs as arrays
        data[key] = formData.getAll(key);
      } else {
        data[key] = value;
      }
    });

    try {
      const response = await fetch("/api/create-member", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        const result = await response.json();
        console.log("Member created successfully:", result);
        alert("Profile created successfully!");
      } else {
        console.error("Failed to create member:", await response.text());
        alert("Failed to create profile. Please try again.");
      }
    } catch (error) {
      console.error("Error creating member:", error);
      alert("An error occurred. Please try again.");
    }
  };

  useEffect(() => {
    // Redirect if not logged in
    if (isLoaded && !isSignedIn) {
      setAuthError(true);
    } else {
      setAuthError(false);
    }
  }, [isLoaded, isSignedIn]);

  if (!isLoaded) {
    return (
      <div className="relative w-screen h-[400px] bg-black bg-fixed bg-no-repeat bg-cover bg-center z-0 parallax-bg align-l">
      <div className="text-white flex flex-col items-start justify-end gap-5 w-[100%] h-[100%] pb-10 font-sans">
        <h1 className="text-red-600 text-[13vw] md:text-[95px] ml-[5%] font-bold">
          Please Sign In
        </h1>
        <h2 className="text-white text-[3vw] md:text-[24px] ml-[5%] font-bold">
          You must be logged in to view this page.
          <SignInButton />
        </h2>
      </div>
    </div>
    );
  }

  if (authError) {
      return (
        <div className="relative w-screen h-[400px] bg-black bg-fixed bg-no-repeat bg-cover bg-center z-0 parallax-bg align-l">
        <div className="text-white flex flex-col items-start justify-end gap-5 w-[100%] h-[100%] pb-10 font-sans">
          <h1 className="text-red-600 text-[13vw] md:text-[95px] ml-[5%] font-bold">
            Please Sign In
          </h1>
          <h2 className="text-white text-[3vw] md:text-[24px] ml-[5%] font-bold">
            You must be logged in to view this page.
            <SignInButton />
          </h2>
        </div>
      </div>
    );
  } else {
    const { user } = useUser();

    return (
      <>
        <div className="relative w-screen h-[400px] bg-black bg-fixed bg-no-repeat bg-cover bg-center z-0 parallax-bg align-l">
          <div className="text-white flex flex-col items-start justify-end gap-5 w-[100%] h-[100%] pb-10 font-sans">
            <h1 className="text-white text-[13vw] md:text-[95px] ml-[5%] font-bold">
              User Onboarding
            </h1>
            <h2 className="text-white text-[3vw] md:text-[24px] ml-[5%] font-bold">
              Thanks for setting up your account. Fill in the following information to complete your profile.
            </h2>
          </div>
        </div>
        <form className="p-10 space-y-6" onSubmit={handleSubmit}>

          <div className="flex flex-col">
            <label className="font-bold" htmlFor="fname">
              First Name
            </label>
            <input type="text" id="fname" name="fname" value={user?.firstName || ""} readOnly className="p-2 border rounded" />
          </div>

          <div className="flex flex-col">
            <label className="font-bold" htmlFor="lname">
              Last Name
            </label>
            <input type="text" id="lname" name="lname" value={user?.lastName || ""} readOnly className="p-2 border rounded" />
          </div>

          <div className="flex flex-col">
            <label className="font-bold" htmlFor="fraternityStatus">
              Fraternity Status
            </label>
            <select id="fraternityStatus" name="fraternityStatus" className="p-2 border rounded">
              {fraternityStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
  
          <div className="flex flex-col">
            <label className="font-bold" htmlFor="rollNumber">
              Roll Number
            </label>
            <input type="number" id="rollNumber" name="rollNumber" className="p-2 border rounded" />
          </div>
  
          <div className="flex flex-col">
            <label className="font-bold" htmlFor="majors">
              Majors
            </label>
            <select multiple id="majors" name="majors" className="p-2 border rounded">
              {engineeringMajors.map((major) => (
                <option key={major} value={major}>
                  {major}
                </option>
              ))}
            </select>
          </div>
  
          <div className="flex flex-col">
            <label className="font-bold" htmlFor="graduationYear">
              Graduation Year
            </label>
            <input type="number" id="graduationYear" name="graduationYear" className="p-2 border rounded" />
          </div>
  
          <div className="flex flex-col">
            <label className="font-bold" htmlFor="big">
              Big
            </label>
            <input type="text" id="big" name="big" className="p-2 border rounded" />
          </div>
  
          <div className="flex flex-col">
            <label className="font-bold" htmlFor="little">
              Little
            </label>
            <select multiple id="little" name="little" className="p-2 border rounded">
              {littleOptions.map((little) => (
                <option key={little} value={little}>
                  {little}
                </option>
              ))}
            </select>
          </div>
  
          <div className="flex flex-col">
            <label className="font-bold" htmlFor="familyLine">
              Family Line
            </label>
            <input type="text" id="familyLine" name="familyLine" className="p-2 border rounded" />
          </div>
  
          <div className="flex flex-col">
            <label className="font-bold" htmlFor="resumeUrl">
              Resume URL
            </label>
            <input type="url" id="resumeUrl" name="resumeUrl" className="p-2 border rounded" />
          </div>
  
          <div className="flex flex-col">
            <label className="font-bold" htmlFor="pledgeClass">
              Pledge Class
            </label>
            <input type="text" id="pledgeClass" name="pledgeClass" className="p-2 border rounded" />
          </div>
  
          <div className="flex items-center gap-2">
            <label className="font-bold" htmlFor="isElected">
              Current e-Council?
            </label>
            <input
              type="checkbox"
              id="isElected"
              name="isElected"
              checked={isElected}
              onChange={(e) => setIsElected(e.target.checked)}
            />
          </div>
  
          {isElected && (
            <div className="flex flex-col">
              <label className="font-bold" htmlFor="eCouncilPosition">
                Current e-Council Position
              </label>
              <select id="eCouncilPosition" name="eCouncilPosition" className="p-2 border rounded">
                {eCouncilPositions.map((position) => (
                  <option key={position} value={position}>
                    {position}
                  </option>
                ))}
              </select>
            </div>
          )}
  
          <div className="flex flex-col">
            <label className="font-bold" htmlFor="committeePositions">
              Committee Positions
            </label>
            <input type="text" id="committeePositions" name="committeePositions" className="p-2 border rounded" />
          </div>
  
          <div className="flex flex-col">
            <label className="font-bold" htmlFor="linkedinLink">
              LinkedIn Link
            </label>
            <input type="url" id="linkedinLink" name="linkedinLink" className="p-2 border rounded" />
          </div>
  
          <div className="flex flex-col">
            <label className="font-bold" htmlFor="githubLink">
              GitHub Link
            </label>
            <input type="url" id="githubLink" name="githubLink" className="p-2 border rounded" />
          </div>
  
          <button type="submit" className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded">
            Submit
          </button>
        </form>
      </>
    );
  }
}