"use client";
import { SlArrowLeft, SlArrowRight } from "react-icons/sl";
import { FaLinkedin as Linkedin } from "react-icons/fa";
import { FaGithub as Github } from "react-icons/fa";
import { FaInstagram as Instagram } from "react-icons/fa";

export default function Members() {

  const member = {
  name: "Achintya Jha",
  major: "Aerospace Engineering, Computer Science, Mechanical Engineering",
  classYear: "CLASS OF 2026",
  biography: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.",
  profileImage: "/randPic1.jpg",
  class: "Tau Gamma",
  currentPosition: "Not an officer",
  hometown: "Tempe, AZ",
  familyLine: "Wiley",
  socials: {
    linkedin: "https://linkedin.com/",
    github: "https://github.com/",
    instagram: "https://instagram.com/"
  },
  roles: ["Pledge Class Scribe", "Tech Committee Member"],
  projects: ["Website Redesign", "Data Analysis"]
  
}
  return (
   <div className="bg-white pt-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex flex-col lg:flex-row lg:gap-16">
          <aside className="lg:w-80 flex-shrink-0">
            <div className="lg:sticky lg:top-8 space-y-8">
              {/* TODO: Use Next Image Component instead */}
              <img
                src={member.profileImage || "/this-should-be-the-default.jpg"}
                alt=""
                className="aspect-[3/4] w-full rounded-lg object-cover"
              />

              <div className="flex gap-4 items-center">
                <a
                  href={member.socials.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-600 hover:text-gray-900"
                >
                  <Linkedin className="h-5 w-5" />
                  <span className="sr-only">LinkedIn</span>
                </a>
                <a
                  href={member.socials.github}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-600 hover:text-gray-900"
                >
                  <Github className="h-5 w-5" />
                  <span className="sr-only">GitHub</span>
                </a>
                <a
                  href={member.socials.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-600 hover:text-gray-900"
                >
                  <Instagram className="h-5 w-5" />
                  <span className="sr-only">Instagram</span>
                </a>
              </div>

              <div className="space-y-6">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">CLASS</h3>
                  <p className="mt-2 text-base font-medium text-gray-900">{member.class}</p>
                </div>

                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">FAMILY LINE</h3>
                  <p className="mt-2 text-base font-medium text-gray-900">{member.familyLine}</p>
                </div>

                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">HOMETOWN</h3>
                  <p className="mt-2 text-base font-medium text-gray-900">{member.hometown}</p>
                </div>
              </div>
            </div>
          </aside>

          <main className="flex-1 mt-12 lg:mt-0">
            <div className="space-y-12">
              <div>
                <h1 className="text-4xl font-bold tracking-tight text-gray-900">{member.name}</h1>
                <div className="mt-3 space-y-1">
                  <p className="text-lg font-semibold uppercase text-gray-900">{member.major}</p>
                  <p className="text-lg font-semibold uppercase text-gray-900">CLASS OF {member.classYear}</p>
                </div>
              </div>

              <div>
                <h2 className="text-lg font-semibold uppercase text-gray-900">BIOGRAPHY</h2>
                <p className="mt-4 text-lg text-gray-600">{member.biography}</p>
              </div>

              <div>
                <h2 className="text-lg font-semibold uppercase text-gray-900">ACTIVE ROLES/LEADERSHIP</h2>
                <ul className="mt-4 space-y-2 text-lg text-gray-600">
                  {member.roles.map((role, index) => (
                    <li key={index}>{role}</li>
                  ))}
                </ul>
              </div>

              <div>
                <h2 className="text-lg font-semibold uppercase text-gray-900">PROJECTS</h2>
                <ul className="mt-4 space-y-2 text-lg text-gray-600">
                  {member.projects.map((project, index) => (
                    <li key={index}>{project}</li>
                  ))}
                </ul>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
