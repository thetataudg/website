"use client";

import Image from "next/image";
import React, { useState } from "react";

export default function Rush() {
  const [faq1Open, setFaq1Open] = useState(false);
  const [faq2Open, setFaq2Open] = useState(false);
  const [faq3Open, setFaq3Open] = useState(false);
  const [faq4Open, setFaq4Open] = useState(false);
  const [faq5Open, setFaq5Open] = useState(false);
  const [faq6Open, setFaq6Open] = useState(false);
  //#E2990D
  return (
    <>
      <div className="relative w-screen h-[400px] bg-orange-parallax bg-fixed bg-no-repeat bg-cover bg-center z-0 parallax-bg align-l">
        <div className="text-white flex flex-col items-start justify-end gap-5 w-[100%] h-[100%] pb-10 font-sans">
          <h1 className="text-black text-[13vw] md:text-[95px] ml-[5%] font-bold">
            Regionals
          </h1>
          <h2 className="text-black text-[4vw] md:text-[30px] ml-[5%]">
            Fall '24 Southwest Regional Conference, Delta Gamma Chapter, ASU
          </h2>
        </div>
      </div>
      <div className="flex flex-col">
        {/* Rush Events Section */}
        <div className="w-screen bg-[#e0e0e0]">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <h1 className="text-[#E2990D] text-[30px] lg:text-3xl font-bold mt-10 pl-10">
                Southwestern Regional Conference Events
              </h1>
              <p className="text-[#171717] text-justify text-sm lg:text-xl p-10 border-l-4 border-[#7a0104] m-10">
                <strong className={"font-bold"}> Brothers of the Theta Tau Southwestern Region,</strong>
                <br/>
                <br/>
                Are you ready to connect and collaborate at the Fall 2024 Southwestern Regional Conference at
                Arizona State University? The Delta Gamma chapter is thrilled to have you with us as we enjoy a day of
                growth, connection, and fun!
                <br/>
                <br/>
                Our mission is to unite chapters across the southwest region by offering a unique opportunity to meet
                new brothers, cultivate valuable skills, and give back to our community. The day will kick off with
                engaging activities followed by hands-on breakout sessions and finish with an impactful act of service.
                <br/>
                <br/>
                We can’t wait to see you on November 9th!
                <br/>
                <br/>
                <em className={"italic"}> We thank our organizing team and all contributors for making this engaging event possible.</em>

              </p>
            </div>

            <div className="force-align-center">
              <div>
                <div className="border-8 border-[#7a0104] m-[40px]">
                  <Image
                    alt=""
                    src="/RegionalsSchedule.png"
                    width="600"
                    height="750"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
