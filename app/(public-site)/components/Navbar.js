"use client";

import Link from "next/link";
import React, { useState } from "react";
import { FaBars, FaTimes } from "react-icons/fa";
import { SignedIn, SignedOut } from "@clerk/nextjs";
import Image from "next/image";
import { Bungee } from "next/font/google";
import { SignInButton } from "@clerk/nextjs";
import { usePathname } from "next/navigation";

const bungee = Bungee({
  subsets: ["latin"],
  display: "swap",
  weight: "400",
});

const Navbar = () => {
  const [nav, setNav] = useState(false);
  const pathname = usePathname();

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
      id: 4,
      linkname: "Rush",
      target: "/rush",
    },
    {
      id: 5,
      linkname: "Merch",
      target: "/merch",
    },
    {
      id: 6,
      linkname: "Brothers",
      target: "/brothers",
    },
  ];

  const handleMemberNavigation = () => {
    window.location.href = "/member";
  };

  const isActive = (target) => {
    if (!pathname) return false;
    if (target === "/") return pathname === "/";
    return pathname.startsWith(target);
  };

  return (
    <nav className="fixed left-1/2 top-4 z-50 w-[94%] max-w-6xl -translate-x-1/2 text-white">
      <div className="flex items-center justify-between rounded-full border border-white/10 bg-black/85 px-5 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.45)] backdrop-blur">
        <a className="flex items-center gap-3" href="/" rel="noreferrer">
          <Image
            src="/crest-transparent.png"
            width={44}
            height={44}
            alt="Theta Tau Fraternity crest"
          />
          <div className="hidden sm:block leading-tight">
            <span className={`${bungee.className} block text-sm uppercase tracking-[0.2em] text-[#b3202a]`}>
              Theta Tau
            </span>
            <span className="block text-xs font-medium text-white/70">
              Delta Gamma Chapter
            </span>
          </div>
        </a>

        <ul className="hidden items-center gap-3 text-sm font-semibold uppercase tracking-[0.18em] md:flex">
        {links.map(({ id, linkname, target }) => (
          <li
            key={id}
            className={`rounded-full px-4 py-2 transition duration-150 ${
              isActive(target)
                ? "bg-white/15 text-white"
                : "hover:text-[#e2ab16]"
            }`}
          >
            <Link href={target}>{linkname}</Link>
          </li>
        ))}
        <SignedIn>
          <li
            className="cursor-pointer transition duration-150 hover:text-[#e2ab16]"
            onClick={handleMemberNavigation}
          >
            Member
          </li>
        </SignedIn>
        <SignedOut>
          <li
            className="rounded-full border border-[#e2ab16] px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-[#e2ab16] transition duration-150 hover:bg-[#e2ab16] hover:text-black"
          >
              <SignInButton
                signUpForceRedirectUrl="/member/onboard"
                signUpFallbackRedirectUrl="/member/onboard"
              >
                Sign In
              </SignInButton>
          </li>
        </SignedOut>
        </ul>

        <div
          onClick={() => setNav(!nav)}
          className="cursor-pointer text-white md:hidden"
        >
          {nav ? <FaTimes size={26} /> : <FaBars size={26} />}
        </div>
      </div>

      {nav && (
        <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur">
          <ul className="mx-auto mt-24 flex w-[90%] max-w-md flex-col items-center gap-6 rounded-3xl bg-black/90 py-10 text-white shadow-[0_12px_40px_rgba(0,0,0,0.5)]">
            {links.map(({ id, linkname, target }) => (
              <li key={id} className="text-xl font-semibold uppercase tracking-[0.2em]">
                <Link onClick={() => setNav(false)} href={target}>
                  {linkname}
                </Link>
              </li>
            ))}
            <SignedIn>
              <li
                className="text-xl font-semibold uppercase tracking-[0.2em]"
                onClick={() => {
                  setNav(false);
                  handleMemberNavigation();
                }}
              >
                Member
              </li>
            </SignedIn>
            <SignedOut>
              <li className="rounded-full border border-[#e2ab16] px-6 py-2 text-sm font-bold uppercase tracking-[0.2em] text-[#e2ab16]">
              <SignInButton
                signUpForceRedirectUrl="/member/onboard"
                signUpFallbackRedirectUrl="/member/onboard"
              />
              </li>
            </SignedOut>
          </ul>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
