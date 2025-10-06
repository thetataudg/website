"use client";

import Link from "next/link";
import React, { useState } from "react";
import { FaBars, FaTimes } from "react-icons/fa";
import { SignedIn } from "@clerk/nextjs";
import Image from "next/image";

const Navbar = () => {
  const [nav, setNav] = useState(false);

  const links = [
    {
      id: 1,
      linkname: "Home",
      target: "/",
    },
    {
      id: 2,
      linkname: "About",
      target: "/about",
    },
    {
      id: 3,
      linkname: "Pillars",
      target: "/pillars",
    },
    {
      id: 4,
      linkname: "Rush",
      target: "/rush",
    },
    {
      id: 5,
      linkname: "Merch",
      target: "/merch",
    },
  ];

  const handleMemberNavigation = () => {
    window.location.href = "/member";
  };

  return (
    <div className="flex justify-between items-center w-full h-20 px-4 text-white bg-black/100 fixed z-100">
      <div>
        <div className="font-signature ml-2 lg:ml-20">
          <a
            className="link-underline link-underline-black inline"
            href="/"
            rel="noreferrer"
          >
            <Image
              className="inline-block justify-center"
              src="/crest-transparent.png"
              width={50}
              height={50}
              alt="Theta Tau Fraternity crest"
            />
            <div className="inline-block justify-center items-start absolute">
              <div className="grid">
                <span className="pl-2 align-middle font-semibold text-red-700 text-xl">
                  Theta Tau Fraternity
                </span>
                <span className="pl-2 align-middle text-m font-normal">
                  Delta Gamma Chapter
                </span>
              </div>
            </div>
          </a>
        </div>
      </div>

      <ul className="hidden md:flex xl:mr-30 lg:mr-20">
        {links.map(({ id, linkname, target }) => (
          <li
            key={id}
            className="nav-links px-4 cursor-pointer capitalize font-medium text-white hover:scale-105 hover:text-slate-400 hover:underline duration-100 link-underline"
          >
            <Link href={target}>{linkname}</Link>
          </li>
        ))}
        <SignedIn>
          <li
            className="nav-links px-4 cursor-pointer capitalize font-medium text-white hover:scale-105 hover:text-slate-400 hover:underline duration-100 link-underline"
            onClick={handleMemberNavigation}
          >
            Profile
          </li>
        </SignedIn>
      </ul>

      <div
        onClick={() => setNav(!nav)}
        className="cursor-pointer pr-4 z-10 text-white md:hidden"
      >
        {nav ? <FaTimes size={30} /> : <FaBars size={30} />}
      </div>

      {nav && (
        <ul
          style={{ zIndex: 5 }}
          className="flex flex-col justify-center items-center absolute top-0 left-0 w-full h-screen backdrop-blur-2xl bg-black/70 to-gray-800 text-white"
        >
          {links.map(({ id, linkname, target }) => (
            <li
              key={id}
              className="px-4 cursor-pointer capitalize py-6 text-4xl"
            >
              <Link onClick={() => setNav(!nav)} href={target}>
                {linkname}
              </Link>
            </li>
          ))}
          <SignedIn>
            <li
              className="px-4 cursor-pointer capitalize py-6 text-4xl"
              onClick={() => {
                setNav(false);
                handleMemberNavigation();
              }}
            >
              Member
            </li>
          </SignedIn>
        </ul>
      )}
    </div>
  );
};

export default Navbar;