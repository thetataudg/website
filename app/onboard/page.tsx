"use client";

import React, { useState } from "react";

export default function Rush() {
  const [isElected, setIsElected] = useState(false);

  // Add more of the majors here
  const engineeringMajors = ["Computer Science", "Mechanical Engineering", "Electrical Engineering", "Civil Engineering", "Biomedical Engineering"];
  const littleOptions = ["Little A", "Little B", "Little C"]; // Fill this in with DB queried list of active users
  const eCouncilPositions = ["Regent", "Vice Regent", "Treasurer", "Scribe", "Corresponding Secretary"];
  const fraternityStatuses = ["Active", "Alumni"];

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
      <form className="p-10 space-y-6">
        <div className="flex flex-col">
          <label className="font-bold" htmlFor="fraternityStatus">Fraternity Status</label>
          <select id="fraternityStatus" className="p-2 border rounded">
            {fraternityStatuses.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col">
          <label className="font-bold" htmlFor="rollNumber">Roll Number</label>
          <input type="number" id="rollNumber" className="p-2 border rounded" />
        </div>

        <div className="flex flex-col">
          <label className="font-bold" htmlFor="majors">Majors</label>
          <select multiple id="majors" className="p-2 border rounded">
            {engineeringMajors.map((major) => (
              <option key={major} value={major}>{major}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col">
          <label className="font-bold" htmlFor="graduationYear">Graduation Year</label>
          <input type="number" id="graduationYear" className="p-2 border rounded" />
        </div>

        <div className="flex flex-col">
          <label className="font-bold" htmlFor="big">Big</label>
          <input type="text" id="big" className="p-2 border rounded" />
        </div>

        <div className="flex flex-col">
          <label className="font-bold" htmlFor="little">Little</label>
          <select multiple id="little" className="p-2 border rounded">
            {littleOptions.map((little) => (
              <option key={little} value={little}>{little}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col">
          <label className="font-bold" htmlFor="familyLine">Family Line</label>
          <input type="text" id="familyLine" className="p-2 border rounded" />
        </div>

        <div className="flex flex-col">
          <label className="font-bold" htmlFor="resumeUrl">Resume URL</label>
          <input type="url" id="resumeUrl" className="p-2 border rounded" />
        </div>

        <div className="flex flex-col">
          <label className="font-bold" htmlFor="pledgeClass">Pledge Class</label>
          <input type="text" id="pledgeClass" className="p-2 border rounded" />
        </div>

        <div className="flex items-center gap-2">
          <label className="font-bold" htmlFor="isElected">Current e-Council?</label>
          <input
            type="checkbox"
            id="isElected"
            checked={isElected}
            onChange={(e) => setIsElected(e.target.checked)}
          />
        </div>

        {isElected && (
          <div className="flex flex-col">
            <label className="font-bold" htmlFor="eCouncilPosition">Current e-Council Position</label>
            <select id="eCouncilPosition" className="p-2 border rounded">
              {eCouncilPositions.map((position) => (
                <option key={position} value={position}>{position}</option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-col">
          <label className="font-bold" htmlFor="committeePositions">Committee Positions</label>
          <input type="text" id="committeePositions" className="p-2 border rounded" />
        </div>

        <div className="flex flex-col">
          <label className="font-bold" htmlFor="linkedinLink">LinkedIn Link</label>
          <input type="url" id="linkedinLink" className="p-2 border rounded" />
        </div>

        <div className="flex flex-col">
          <label className="font-bold" htmlFor="githubLink">GitHub Link</label>
          <input type="url" id="githubLink" className="p-2 border rounded" />
        </div>

        <button type="submit" className="px-4 py-2 bg-blue-500 text-white rounded">
          Submit
        </button>
      </form>
    </>
  );
}
