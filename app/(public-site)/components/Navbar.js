"use client";

import Link from "next/link";
import React, { useState } from "react";
import { FaBars, FaChevronDown, FaTimes } from "react-icons/fa";
import { SignedIn, SignedOut } from "@clerk/nextjs";
import Image from "next/image";
import { SignInButton } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { bungee } from "../../fonts";

const Navbar = () => {
  const [nav, setNav] = useState(false);
  const [brothersMobileOpen, setBrothersMobileOpen] = useState(false);
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
      linkname: "Brothers",
      target: "/brothers",
    },
  ];

  const brothersSubmenuLinks = [
    {
      id: 1,
      linkname: "Family Tree",
      target: "/brothers/family-tree",
    },
    {
      id: 2,
      linkname: "Actives",
      target: "/brothers?filter=Active",
    },
    {
      id: 3,
      linkname: "Alumni",
      target: "/brothers?filter=Alumni",
    },
    {
      id: 4,
      linkname: "Officers",
      target: "/brothers?filter=Officers",
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

  const closeMobileMenu = () => {
    setNav(false);
    setBrothersMobileOpen(false);
  };

  const toggleMobileMenu = () => {
    setNav((current) => {
      const next = !current;
      if (!next) {
        setBrothersMobileOpen(false);
      }
      return next;
    });
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
            {links.map(({ id, linkname, target }) => {
              if (linkname === "Brothers") {
                return (
                  <li key={id} className="group relative">
                    <Link
                      href={target}
                      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 transition duration-150 ${
                        isActive(target)
                          ? "bg-white/14 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]"
                          : "text-white/88 hover:bg-white/8 hover:text-[#f5d79a]"
                      }`}
                    >
                      {linkname}
                      <FaChevronDown
                        size={12}
                        className="transition-transform duration-200 group-hover:rotate-180"
                        aria-hidden="true"
                      />
                    </Link>
                    <div className="pointer-events-none absolute left-1/2 top-full z-50 w-56 -translate-x-1/2 pt-2 opacity-0 transition duration-200 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
                      <div className="rounded-2xl border border-white/10 bg-[#130c0c]/95 p-2 shadow-[0_12px_36px_rgba(0,0,0,0.45)] backdrop-blur-lg">
                      <ul className="space-y-1">
                        {brothersSubmenuLinks.map((subLink) => (
                          <li key={subLink.id}>
                            <Link
                              href={subLink.target}
                              className="block rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/85 transition hover:bg-white/10 hover:text-[#f5d79a]"
                            >
                              {subLink.linkname}
                            </Link>
                          </li>
                        ))}
                      </ul>
                      </div>
                    </div>
                  </li>
                );
              }

              return (
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
              );
            })}
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
                  signInForceRedirectUrl="/member"
                  signInFallbackRedirectUrl="/member"
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
            onClick={toggleMobileMenu}
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
          onClick={closeMobileMenu}
        >
          <div
            className="mx-auto mt-24 w-[90%] max-w-md rounded-[30px] bg-gradient-to-r from-[#f5d79a]/45 via-[#b3202a]/45 to-[#f5d79a]/45 p-[1px]"
            onClick={(event) => event.stopPropagation()}
          >
            <ul className="flex flex-col items-center gap-6 rounded-[30px] bg-[linear-gradient(130deg,rgba(7,7,7,0.95),rgba(20,11,11,0.9),rgba(7,7,7,0.95))] py-10 text-white shadow-[0_12px_40px_rgba(0,0,0,0.5)]">
              {links.map(({ id, linkname, target }) => {
                if (linkname === "Brothers") {
                  return (
                    <li key={id} className="w-full px-8">
                      <button
                        type="button"
                        onClick={() => setBrothersMobileOpen((current) => !current)}
                        className="mx-auto flex w-full max-w-[280px] items-center justify-center gap-3 text-xl font-semibold uppercase tracking-[0.2em]"
                      >
                        Brothers
                        <FaChevronDown
                          size={16}
                          className={`transition-transform duration-200 ${
                            brothersMobileOpen ? "rotate-180" : ""
                          }`}
                          aria-hidden="true"
                        />
                      </button>
                      {brothersMobileOpen && (
                        <ul className="mt-4 flex flex-col items-center gap-4">
                          {brothersSubmenuLinks.map((subLink) => (
                            <li
                              key={subLink.id}
                              className="text-sm font-semibold uppercase tracking-[0.2em] text-white/85"
                            >
                              <Link
                                onClick={closeMobileMenu}
                                href={subLink.target}
                              >
                                {subLink.linkname}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                }

                return (
                  <li key={id} className="text-xl font-semibold uppercase tracking-[0.2em]">
                    <Link onClick={closeMobileMenu} href={target}>
                      {linkname}
                    </Link>
                  </li>
                );
              })}
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
                    signInForceRedirectUrl="/member"
                    signInFallbackRedirectUrl="/member"
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
