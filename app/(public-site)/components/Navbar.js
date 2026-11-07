"use client";

import Link from "next/link";
import React, { useState } from "react";
import { FaBars, FaChevronDown, FaTimes } from "react-icons/fa";
import { SignedIn, SignedOut } from "@clerk/nextjs";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { bungee } from "../../fonts";

const ctaClass =
  "tt-button-primary !h-[34px] !px-3.5 !text-[13px]";

const Navbar = () => {
  const [nav, setNav] = useState(false);
  const [brothersMobileOpen, setBrothersMobileOpen] = useState(false);
  const pathname = usePathname();

  const links = [
    { id: 1, linkname: "Home", target: "/" },
    { id: 2, linkname: "About", target: "/about" },
    { id: 4, linkname: "Rush", target: "/rush" },
    { id: 5, linkname: "Brothers", target: "/brothers" },
  ];

  const brothersSubmenuLinks = [
    { id: 1, linkname: "Family Tree", target: "/brothers/family-tree" },
    { id: 2, linkname: "Actives", target: "/brothers?filter=Active" },
    { id: 3, linkname: "Alumni", target: "/brothers?filter=Alumni" },
    { id: 4, linkname: "Officers", target: "/brothers?filter=Officers" },
  ];

  const handleMemberNavigation = () => {
    window.location.href = "/member";
  };

  const isActive = (target) => {
    if (!pathname) return false;
    if (target === "/") return pathname === "/";
    return pathname.startsWith(target);
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

  const desktopLinkClass = (target) =>
    `relative inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold tracking-[0.01em] transition-colors duration-150 hover:text-[#fbf6dc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#e2ab16] ${
      isActive(target) ? "text-[#fbf6dc]" : "text-[#fbf6dc]/70"
    }`;

  const activeUnderline = (target) =>
    isActive(target) ? (
      <span
        aria-hidden="true"
        className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-[#e2ab16]"
      />
    ) : null;

  return (
    <nav className="fixed inset-x-0 top-3 z-50 mx-auto w-[calc(100%-32px)] max-w-6xl text-[#fbf6dc]">
      <div className="relative z-10 flex h-[52px] items-center justify-between rounded-xl border border-[#fbf6dc]/10 bg-[#120a0a]/80 px-3 backdrop-blur-xl md:h-14 md:px-4">
        <a className="flex items-center gap-2.5" href="/" rel="noreferrer">
          <Image
            src="/crest-transparent.png"
            width={32}
            height={32}
            alt="Theta Tau Fraternity crest"
            className="h-8 w-8"
          />
          <div className="leading-tight">
            <span className={`${bungee.className} block text-[12px] uppercase tracking-[0.12em] text-[#cf3640]`}>
              Theta Tau
            </span>
            <span className="hidden text-[11px] font-medium text-[#fbf6dc]/60 lg:block">
              Delta Gamma Chapter
            </span>
          </div>
        </a>

        <ul className="hidden items-center gap-1 md:flex">
          {links.map(({ id, linkname, target }) => {
            if (linkname === "Brothers") {
              return (
                <li key={id} className="group relative">
                  <Link href={target} className={desktopLinkClass(target)}>
                    {linkname}
                    <FaChevronDown
                      size={10}
                      className="opacity-70 transition-transform duration-200 group-hover:rotate-180 group-focus-within:rotate-180"
                      aria-hidden="true"
                    />
                    {activeUnderline(target)}
                  </Link>
                  <div className="pointer-events-none absolute left-1/2 top-full z-50 w-48 -translate-x-1/2 pt-2 opacity-0 transition duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
                    <div className="rounded-xl border border-[#fbf6dc]/10 bg-[#130c0c]/95 p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.45)] backdrop-blur-lg">
                      <ul>
                        {brothersSubmenuLinks.map((subLink) => (
                          <li key={subLink.id}>
                            <Link
                              href={subLink.target}
                              className="block rounded-lg px-3 py-2 text-sm font-medium text-[#fbf6dc]/75 transition-colors hover:bg-white/[0.06] hover:text-[#fbf6dc]"
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
                <Link href={target} className={desktopLinkClass(target)}>
                  {linkname}
                  {activeUnderline(target)}
                </Link>
              </li>
            );
          })}
          <SignedIn>
            <li className="ml-2">
              <button type="button" onClick={handleMemberNavigation} className={ctaClass}>
                Member
              </button>
            </li>
          </SignedIn>
          <SignedOut>
            <li className="ml-2">
              {/* A plain link, not Clerk's <SignInButton>. Wrapping a custom
                * child made Clerk clone it and spread the four redirect props
                * straight onto the DOM <button> — React warned about every
                * one of them, and none of them took effect, so signing in
                * from here landed on the public homepage. /sign-in already
                * defaults to /member, which is what those props were asking
                * for in the first place. */}
              <Link href="/sign-in" className={ctaClass}>
                Sign in
              </Link>
            </li>
          </SignedOut>
        </ul>

        <button
          type="button"
          onClick={toggleMobileMenu}
          className={`grid h-10 w-10 place-items-center rounded-lg text-[#fbf6dc] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#e2ab16] md:hidden ${
            nav ? "bg-white/[0.08]" : "hover:bg-white/[0.06]"
          }`}
          aria-label={nav ? "Close menu" : "Open menu"}
          aria-expanded={nav}
        >
          {nav ? <FaTimes size={18} /> : <FaBars size={18} />}
        </button>
      </div>

      {nav && (
        <>
          <div
            className="fixed inset-0 -z-10 bg-black/60 md:hidden"
            onClick={closeMobileMenu}
            aria-hidden="true"
          />
          <div className="absolute inset-x-0 top-full mt-2 rounded-2xl border border-[#fbf6dc]/10 bg-[#140c0c] p-2 shadow-[0_16px_40px_rgba(0,0,0,0.55)] md:hidden">
            <ul className="flex flex-col">
              {links.map(({ id, linkname, target }) => {
                if (linkname === "Brothers") {
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        onClick={() => setBrothersMobileOpen((current) => !current)}
                        aria-expanded={brothersMobileOpen}
                        className={`flex h-11 w-full items-center justify-between rounded-lg px-3 text-left text-base font-semibold ${
                          isActive(target) ? "text-[#fbf6dc]" : "text-[#fbf6dc]/80"
                        }`}
                      >
                        Brothers
                        <FaChevronDown
                          size={12}
                          className={`transition-transform duration-200 ${
                            brothersMobileOpen ? "rotate-180" : ""
                          }`}
                          aria-hidden="true"
                        />
                      </button>
                      {brothersMobileOpen && (
                        <ul className="mb-1 ml-3 flex flex-col border-l border-[#fbf6dc]/10 pl-2">
                          {brothersSubmenuLinks.map((subLink) => (
                            <li key={subLink.id}>
                              <Link
                                onClick={closeMobileMenu}
                                href={subLink.target}
                                className="flex h-11 items-center rounded-lg px-3 text-[15px] font-medium text-[#fbf6dc]/70"
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
                  <li key={id}>
                    <Link
                      onClick={closeMobileMenu}
                      href={target}
                      className={`flex h-11 items-center gap-2 rounded-lg px-3 text-base font-semibold ${
                        isActive(target) ? "text-[#fbf6dc]" : "text-[#fbf6dc]/80"
                      }`}
                    >
                      {linkname}
                      {isActive(target) && (
                        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#e2ab16]" />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="mt-2 border-t border-[#fbf6dc]/10 p-1 pt-3">
              <SignedIn>
                <button
                  type="button"
                  className="tt-button-primary !h-11 w-full"
                  onClick={() => {
                    setNav(false);
                    handleMemberNavigation();
                  }}
                >
                  Member
                </button>
              </SignedIn>
              <SignedOut>
                <Link
                  href="/sign-in"
                  onClick={() => setNav(false)}
                  className="tt-button-primary !h-11 w-full"
                >
                  Sign in
                </Link>
              </SignedOut>
            </div>
          </div>
        </>
      )}
    </nav>
  );
};

export default Navbar;
