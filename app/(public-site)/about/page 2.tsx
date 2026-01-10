"use client";
import React from "react";
import { useEffect } from "react";
import Image from "next/image";
import mission from "/public/mission.png";
import randPic1 from "/public/randPic1.jpg";
import randPic2 from "/public/randPic2.jpg";
import randPic3 from "/public/randPic3.jpg";

import AWS from "/public/company_carousel/amazon-web-services-2.svg";
import Disney from "/public/company_carousel/disney.svg";
import Ford from "/public/company_carousel/ford-1.svg";
import DOD from "/public/company_carousel/us-department-of-defense.svg";
import PS from "/public/company_carousel/playstation-6.svg";
import MKB from "/public/company_carousel/milwaukee-brewers-1.svg";
import NG from "/public/company_carousel/northrop-grumman-1.svg";
import LHM from "/public/company_carousel/lockheed-martin.svg";
import Intel from "/public/company_carousel/intel.svg";
import HW from "/public/company_carousel/honeywell-logo.svg";
import Boeing from "/public/company_carousel/boeing-3.svg";
import Apple from "/public/company_carousel/apple-14.svg";
import AllS from "/public/company_carousel/allstate-logo.svg";
import Accent from "/public/company_carousel/accenture-7.svg";

export default function About() {
  useEffect(() => {
    const handleScroll = () => {
      const parallax = document.querySelector(".parallax-bg") as HTMLElement;
      if (parallax) {
        const offset = window.scrollY;
        parallax.style.backgroundPositionY = `calc(50% + ${-offset * 0.5}px)`;
      }
    };

    window.addEventListener("scroll", handleScroll);

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  return (
    <>
      <div className="relative w-screen h-[400px] bg-grey-parallax bg-fixed bg-no-repeat bg-cover bg-center z-0 parallax-bg align-l
      text-white flex flex-col items-start justify-end h-[100%] pb-10 font-sans">
        <h1 className={"text-black text-[13vw] md:text-[95px] ml-[5%] font-bold"}>
          About
        </h1>
        <h2 className="text-black text-[4vw] md:text-[30px] ml-[5%]">
          Learn more about the Delta Gamma Chapter
        </h2>
      </div>

      <div className="w-[100%] bg-white flex flex-col">
        <div className="w-[100%] flex flex-col lg:flex-row gap-3  items-center py-5 px-10">
          <div className="lg:w-[40%]  flex flex-col gap-3 w-[100%]">
            <h1 className="text-2xl font-bold text-[#7a0104]">
              Theta Tau - Delta Gamma Chapter at ASU
            </h1>
            <p className="w-[100%] text-lg lg:text-xl">
              Welcome to the Delta Gamma chapter of Theta Tau, the nation's
              oldest and largest professional engineering fraternity, here at
              Arizona State University. Established in 1904, Theta Tau is
              dedicated to fostering the personal and professional development
              of its members through academic support, leadership opportunities,
              and a strong sense of brotherhood.
            </p>
            <p className="w-[100%] text-lg lg:text-xl">
              The Delta Gamma chapter was founded May 6th, 1995 at Arizona State
              University (ASU). We have over 50 active student members, and
              over 400 total members.
            </p>
          </div>
          <div className="lg:w-[60%] flex flex-row justify-center items-center gap-2 w-[100%]">
            <Image alt="costco" src={randPic3} className="w-[48%] h-[auto]" />
            <div className="w-[48%] flex flex-col gap-4 justify-start">
              <Image
                alt="beach pic"
                src={randPic2}
                className="w-[100%] h-[auto]"
              />
              <Image
                alt="hot chicken"
                src={randPic1}
                className="w-[100%] h-[auto]"
              />
            </div>
          </div>
        </div>
        <div className="w-[100%] py-5 px-10  flex flex-col gap-5 bg-[#e0e0e0]">
          <div className="flex flex-col gap-3">
            <h1 className="text-2xl font-bold text-[#7a0104] text-center lg:text-left">
              Our Mission
            </h1>
            <p className="text-lg lg:text-xl">
              Theta Tau’s mission is to develop engineering leaders for service,
              profession, and society. At the Delta Gamma chapter, we strive to
              equip our members with the skills and resources needed to thrive
              both in their careers and in life.
            </p>
            <ul className="flex flex-col gap-3">
              <li>
                <p className="text-lg lg:text-xl">
                  <span className="font-bold text-[#7a0104]">
                    Professional Development:
                  </span>{" "}
                  We offer career-building workshops, mentorship, and networking
                  opportunities to help members excel in their chosen fields.
                </p>
              </li>
              <li>
                <p className="text-lg lg:text-xl">
                  <span className="font-bold text-[#7a0104]">
                    Brotherhood and Friendship:
                  </span>{" "}
                  Beyond professional growth, we cultivate a supportive
                  environment that encourages strong bonds among members.
                </p>
              </li>
              <li>
                <p className="text-lg lg:text-xl">
                  <span className="font-bold text-[#7a0104]">
                    Community Service:
                  </span>{" "}
                  Our chapter actively participates in service projects, giving
                  back to the campus and the local community.
                </p>
              </li>
            </ul>
            <div className="w-[100%] flex justify-center items-center">
              <Image
                alt="mission"
                src={mission}
                className="lg:w-[40%] h-[auto] w-[70%]"
              />
            </div>
          </div>
        </div>
        <div className="w-[100%] py-5 px-10 flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold text-[#7a0104] text-center lg:text-left">
              Purpose
            </h1>
            <p className="text-lg lg:text-xl">
              The purpose of Theta Tau is to develop and maintain a high
              standard of professional interest among its members and to unite
              them in a strong bond of fraternal fellowship.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold text-[#7a0104] text-center lg:text-left ">
              Open Motto
            </h1>
            <p className="italic font-bold text-center lg:text-left">
              "Whatsoever thy hand findeth to do, do it with thy might;…"
              --Ecclesiastes 9:10
            </p>
          </div>
        </div>
        <div className="w-[100%] flex flex-col gap-5 justify-center items-center bg-[#e0e0e0] py-5 px-10">
          <h1 className="text-2xl font-bold text-[#7a0104]">
            We Work At
          </h1>
          <div className="logos">
            <div className="logos-slide">
              <AWS className="logo-slide-item" />
              <Disney className="logo-slide-item" />
              <Ford className="logo-slide-item" />
              <DOD className="logo-slide-item" />
              <PS className="logo-slide-item" />
              <MKB className="logo-slide-item" />
              <NG className="logo-slide-item" />
              <LHM className="logo-slide-item" />
              <Intel className="logo-slide-item" />
              <HW className="logo-slide-item" />
              <Boeing className="logo-slide-item" />
              <Apple className="logo-slide-item" />
              <AllS className="logo-slide-item" />
              <Accent className="logo-slide-item" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
