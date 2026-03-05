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

  const updateLiquidRefraction = (event) => {
    const shell = event.currentTarget;
    const rect = shell.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    shell.style.setProperty("--mx", `${x}%`);
    shell.style.setProperty("--my", `${y}%`);
  };

  const resetLiquidRefraction = (event) => {
    const shell = event.currentTarget;
    shell.style.setProperty("--mx", "50%");
    shell.style.setProperty("--my", "45%");
  };

  return (
    <nav className="fixed left-1/2 top-4 z-50 w-[94%] max-w-6xl -translate-x-1/2 text-white">
      <div
        className="tt-liquid-nav-shell"
        onMouseMove={updateLiquidRefraction}
        onMouseLeave={resetLiquidRefraction}
      >
        <span className="tt-liquid-nav-specular" aria-hidden="true" />
        <div className="relative z-10 flex items-center justify-between rounded-full bg-black/30 px-4 py-2.5 md:px-5 md:py-3">
          <a className="flex items-center gap-3" href="/" rel="noreferrer">
            <Image
              src="/crest-transparent.png"
              width={44}
              height={44}
              alt="Theta Tau Fraternity crest"
              className="h-10 w-10 md:h-11 md:w-11"
            />
            <div className="hidden leading-tight sm:block">
              <span className={`${bungee.className} block text-sm uppercase tracking-[0.2em] text-[#cf3640]`}>
                Theta Tau
              </span>
              <span className="block text-xs font-medium text-white/70">
                Delta Gamma Chapter
              </span>
            </div>
          </a>

          <ul className="hidden items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] md:flex">
            {links.map(({ id, linkname, target }) => (
              <li key={id}>
                <Link
                  href={target}
                  className={`rounded-full px-4 py-2 transition duration-150 ${
                    isActive(target)
                      ? "bg-white/14 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]"
                      : "text-white/88 hover:bg-white/8 hover:text-[#f5d79a]"
                  }`}
                >
                  {linkname}
                </Link>
              </li>
            ))}
            <SignedIn>
              <li>
                <button
                  type="button"
                  onClick={handleMemberNavigation}
                  className="rounded-full bg-gradient-to-r from-[#f5d79a] via-[#e2ab16] to-[#f5d79a] p-[1px]"
                >
                  <span className="block rounded-full bg-[#140d0d] px-5 py-2 text-xs font-bold uppercase tracking-[0.2em] text-[#f8ead4] transition hover:bg-[#1d1212]">
                    Member
                  </span>
                </button>
              </li>
            </SignedIn>
            <SignedOut>
              <li>
                <SignInButton
                  signUpForceRedirectUrl="/member/onboard"
                  signUpFallbackRedirectUrl="/member/onboard"
                >
                  <button
                    type="button"
                    className="rounded-full bg-gradient-to-r from-[#f5d79a] via-[#e2ab16] to-[#f5d79a] p-[1px]"
                  >
                    <span className="block rounded-full bg-[#140d0d] px-5 py-2 text-xs font-bold uppercase tracking-[0.2em] text-[#f8ead4] transition hover:bg-[#1d1212]">
                      Sign In
                    </span>
                  </button>
                </SignInButton>
              </li>
            </SignedOut>
          </ul>

          <button
            type="button"
            onClick={() => setNav(!nav)}
            className={`grid h-11 w-11 place-items-center rounded-full border text-white transition md:hidden ${
              nav
                ? "border-[#f5d79a]/70 bg-[#1a1111]"
                : "border-white/15 bg-white/5 hover:bg-white/10"
            }`}
            aria-label={nav ? "Close menu" : "Open menu"}
          >
            {nav ? <FaTimes size={22} /> : <FaBars size={22} />}
          </button>
        </div>
      </div>

      {nav && (
        <div
          className="fixed inset-0 z-40 bg-black/72 md:hidden"
          onClick={() => setNav(false)}
        >
          <div
            className="mx-auto mt-24 w-[90%] max-w-md rounded-[30px] bg-gradient-to-r from-[#f5d79a]/45 via-[#b3202a]/45 to-[#f5d79a]/45 p-[1px]"
            onClick={(event) => event.stopPropagation()}
          >
            <ul className="flex flex-col items-center gap-6 rounded-[30px] bg-[linear-gradient(130deg,rgba(7,7,7,0.95),rgba(20,11,11,0.9),rgba(7,7,7,0.95))] py-10 text-white shadow-[0_12px_40px_rgba(0,0,0,0.5)]">
              {links.map(({ id, linkname, target }) => (
                <li key={id} className="text-xl font-semibold uppercase tracking-[0.2em]">
                  <Link onClick={() => setNav(false)} href={target}>
                    {linkname}
                  </Link>
                </li>
              ))}
              <SignedIn>
                <li>
                  <button
                    type="button"
                    className="rounded-full bg-gradient-to-r from-[#f5d79a] via-[#e2ab16] to-[#f5d79a] p-[1px]"
                    onClick={() => {
                      setNav(false);
                      handleMemberNavigation();
                    }}
                  >
                    <span className="block rounded-full bg-[#140d0d] px-6 py-2 text-sm font-bold uppercase tracking-[0.2em] text-[#f8ead4]">
                      Member
                    </span>
                  </button>
                </li>
              </SignedIn>
              <SignedOut>
                <li>
                  <SignInButton
                    signUpForceRedirectUrl="/member/onboard"
                    signUpFallbackRedirectUrl="/member/onboard"
                  >
                    <button
                      type="button"
                      onClick={() => setNav(false)}
                      className="rounded-full bg-gradient-to-r from-[#f5d79a] via-[#e2ab16] to-[#f5d79a] p-[1px]"
                    >
                      <span className="block rounded-full bg-[#140d0d] px-6 py-2 text-sm font-bold uppercase tracking-[0.2em] text-[#f8ead4]">
                        Sign In
                      </span>
                    </button>
                  </SignInButton>
                </li>
              </SignedOut>
            </ul>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
