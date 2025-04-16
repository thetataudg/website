"use client"; // ref: https://stackoverflow.com/questions/74965849/youre-importing-a-component-that-needs-usestate-it-only-works-in-a-client-comp

import {
  ClerkProvider,
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
} from '@clerk/nextjs'



import Link from "next/link";
import React, { useState } from "react";
import Image from "next/image";
import Socials from "./Socials.js";

const Footer = () => {
  return (
    <footer className="p-4 bg-black text-white sm:p-6">
      <div className="mx-auto max-w-screen-xl">
        <div className="md:flex md:justify-between">
          <div className="flex items-center mb-6 md:mb-0">
            <Image
              src={"/crest-transparent.png"}
              width={128}
              height={128}
              className="relative left-[-28px]"
            />
            <div>
              <Link href="/" className="flex items-center">
                <span className="self-center text-2xl font-semibold whitespace-nowrap">
                  Theta Tau
                </span>
              </Link>
              <h3 className="text-base text-neutral-400">
                Delta Gamma Chapter
              </h3>
              <h3 className="text-base text-neutral-500">
                Arizona State University
              </h3>
            </div>
          </div>
          <div className="mb-5">
            <h2 className="mb-6 text-sm font-semibold text-neutral-100 uppercase">
              Contacts
            </h2>
            <ul className="text-neutral-400 space-y-2">
              <li>Regent - Cristian Holguin</li>
              <li>Vice Regent - Robert Kuehler</li>
              <li>Rush Chair - Sonny Diaz</li>
              <li>
                <a
                  className="underline underline-offset-4 text-neutral-200"
                  href="mailto:general@thetatau-dg.org"
                >
                  Email Us
                </a>
              </li>
            </ul>
          </div>
          <div className="mb-4">
            <h2 className="mb-6 text-sm font-semibold text-neutral-100 uppercase">
              Links{" "}
            </h2>
            <ul className="text-neutral-400 space-y-2">
              <li>
                <Link href="/about" className="hover:underline">
                  About
                </Link>
              </li>
              <li>
                <Link href="/rush" className="hover:underline">
                  Rush
                </Link>
              </li>
              <li>
                <Link href="/regionals" className="hover:underline">
                  Regionals
                </Link>
              </li>
              <li>
              <h2 className="mb-2 mt-5 text-sm font-semibold text-neutral-100 uppercase">
                Members Only{" "}
              </h2>
                <SignedOut>
                  <SignInButton /> <br />
                </SignedOut>
                <SignedIn>
                  <UserButton />
                </SignedIn>
            </li>
            </ul>
          </div>
          <div>
            <h2 className="mb-6 text-sm font-semibold text-neutral-100 uppercase">
              Pillars{" "}
            </h2>
            <ul className="space-y-4 text-neutral-400">
              <li>
                <Link href="/pillars#brotherhood" className="hover:underline ">
                  Brotherhood
                </Link>
              </li>
              <li>
                <Link
                  href="/pillars#professionalism"
                  className="hover:underline"
                >
                  Professionalism
                </Link>
              </li>
              <li>
                <Link href="/pillars#service" className="hover:underline">
                  Service
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <Socials />
      </div>
    </footer>
  );
};

export default Footer;
