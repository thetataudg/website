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

  return (
    <>
      <div className="relative w-screen h-[400px] bg-yellow-parallax bg-fixed bg-no-repeat bg-cover bg-center z-0 parallax-bg align-l">
        <div className="text-white flex flex-col items-start justify-end gap-5 w-[100%] h-[100%] pb-10 font-sans">
          <h1 className="text-black text-[13vw] md:text-[95px] ml-[5%] font-bold">
            Recruitment
          </h1>
          <h2 className="text-black text-[3vw] md:text-[24px] ml-[5%] font-bold">
            Rush for the Spring 2025 semester is now over. Please fill out the Rush Interest Form below if you are interested in rushing next semester!
          </h2>
          <a
              href="https://forms.gle/yNUJKf1JwkvvrbEJ6"
              target="_blank"
              className="tt-button-rush hover:bg-white hover:text-black mr-5 ml-[5%]"
          >
            Rush Interest Form
          </a>
        </div>
      </div>
      <div className="flex flex-col">
        {/* Why Join Section */}
        <div className="w-screen bg-[#ffffff]">
          <h1 className="text-[#7a0104] text-[30px] lg:text-3xl font-bold mt-10 pl-10">
            Why should you join?
          </h1>
          <p className="text-[#171717] text-justify text-[15px] lg:text-xl p-10">
            Whether you want to build connections, develop professional skills,
            or just come for the free pizza, there are plenty of reasons to rush
            Theta Tau. For many engineering students here at ASU, Theta Tau is
            the defining part of their college experience. As the oldest and
            largest coed engineering fraternity in the nation, joining Theta Tau
            can open up a whole world of possibilities to the aspiring engineer.
          </p>
        </div>

        {/* Rush Events Section */}
        <div className="w-screen bg-[#e0e0e0]">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <h1 className="text-[#7a0104] text-[30px] lg:text-3xl font-bold mt-10 pl-10">
                Spring 2025 Rush Events
              </h1>
              <p className="text-[#171717] text-justify text-[15px] lg:text-xl p-10 border-l-4 border-[#7a0104] m-10">
                Game Night - Thursday January 23, 7:30PM - GWC 487
                <br />
                <br />
                Donuts and Dog Toys - Friday January 24, 7:30PM - ECG 101
                <br />
                <br />
                Bob Ross Night - Wednesday January 29, 7:30PM - ECG 101
                <br />
                <br />
                Engineering Challenge - Thursday January 30, 7:30PM - GWC 487
                <br />
                <br />
                Meet the House - Friday January 31, 6:30PM - MU 241C
                <br />
                <br />
              </p>
            </div>

            <div className="force-align-center">
              <div>
                <div className="border-8 border-[#7a0104] m-[40px]">
                  <Image
                    alt=""
                    src="/rush/Spring2025_Rush.png"
                    width="400"
                    height="500"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="w-screen bg-[#FFFFFF]">
          <h1 className="text-[#7a0104] text-[30px] lg:text-3xl font-bold mt-10 pl-10 gap-5">
            FAQs
          </h1>

          {/* Dropdown 1 */}
          <div className="pl-10 pr-10 mt-5">
            <button
              onClick={() => setFaq1Open(!faq1Open)}
              className="w-full h-[50px] flex justify-between items-center px-4 bg-gray-200 text-gray-800 font-semibold rounded-md hover:bg-gray-300"
            >
              What is Rush?
              <svg
                className={`w-[30px] h-[30px] transform transition-transform duration-300 ${
                  faq1Open ? "rotate-180" : ""
                }`}
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
            {faq1Open && (
              <div className="mt-2 p-4 bg-gray-100 rounded-md text-gray-700">
                Rush is a two-week period full of fun events to help you get to
                know Theta Tau. We host info sessions, game nights, and much
                more! Attending rush events is the first step in becoming a
                member of Theta Tau. All events are FREE, and often have free
                food. So stop by and have some fun!
              </div>
            )}
          </div>

          {/* Dropdown 2 */}
          <div className="pl-10 pr-10 mt-5">
            <button
              onClick={() => setFaq2Open(!faq2Open)}
              className="w-full h-[50px] flex justify-between items-center px-4 bg-gray-200 text-gray-800 font-semibold rounded-md hover:bg-gray-300"
            >
              What is Pledging?
              <svg
                className={`w-[30px] h-[30px] transform transition-transform duration-300 ${
                  faq2Open ? "rotate-180" : ""
                }`}
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
            {faq2Open && (
              <div className="mt-2 p-4 bg-gray-100 rounded-md text-gray-700">
                Pledging is your chance to determine if Theta Tau is the right
                fit for you, and prepares you for becoming a member. Pledging is
                the next step after rush, and is a semester long process. You
                will get to meet all its members, learn about the history of the
                chapter and the fraternity, participate in professional and
                service events, and form bonds which will last the rest of your
                life. You will help pick your ‘big brother’ who is an active
                member that will guide you through the pledging process, and for
                many years to come.
              </div>
            )}
          </div>

          {/* Dropdown 3 */}
          <div className="pl-10 pr-10 mt-5">
            <button
              onClick={() => setFaq3Open(!faq3Open)}
              className="w-full h-[50px] flex justify-between items-center px-4 bg-gray-200 text-gray-800 font-semibold rounded-md hover:bg-gray-300"
            >
              Am I eligible to join?
              <svg
                className={`w-[30px] h-[30px] transform transition-transform duration-300 ${
                  faq3Open ? "rotate-180" : ""
                }`}
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
            {faq3Open && (
              <div className="mt-2 p-4 bg-gray-100 rounded-md text-gray-700">
                You must meet the following requirements at the time of
                initiation
                <br />
                <br />
                -Be within an ABET accredited major at Arizona State University
                <br />
                -Have at least 6 months before graduation
                <br />
                -Have a minimum (passing GPA) of 2.0
                <br />
                -Not be a member of a competing Fraternity or Sorority
                <br />
                -At least 18 years old
                <br />
              </div>
            )}
          </div>

          {/* Dropdown 4 */}
          <div className="pl-10 pr-10 mt-5">
            <button
              onClick={() => setFaq4Open(!faq4Open)}
              className="w-full h-[50px] flex justify-between items-center px-4 bg-gray-200 text-gray-800 font-semibold rounded-md hover:bg-gray-300"
            >
              What if I change my major from engineering?
              <svg
                className={`w-[30px] h-[30px] transform transition-transform duration-300 ${
                  faq4Open ? "rotate-180" : ""
                }`}
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
            {faq4Open && (
              <div className="mt-2 p-4 bg-gray-100 rounded-md text-gray-700">
                As long as you are enrolled in engineering at the time of
                initiation, you will be a member of Theta Tau for life. While we
                focus on engineering, and most of our members complete degrees
                in engineering, we do have members change majors.
              </div>
            )}
          </div>

          {/* Dropdown 5 */}
          <div className="pl-10 pr-10 mt-5">
            <button
              onClick={() => setFaq5Open(!faq5Open)}
              className="w-full h-[50px] flex justify-between items-center px-4 bg-gray-200 text-gray-800 font-semibold rounded-md hover:bg-gray-300"
            >
              How is Theta Tau different than an honors society?
              <svg
                className={`w-[30px] h-[30px] transform transition-transform duration-300 ${
                  faq5Open ? "rotate-180" : ""
                }`}
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
            {faq5Open && (
              <div className="mt-2 p-4 bg-gray-100 rounded-md text-gray-700">
                Honor societies are great for being around people that share an
                academic interest with you. These are excellent groups for
                furthering your interests in a topic, but the benefits often
                stop there. Because Theta Tau is a brotherhood, you will join a
                group of people that take friendships beyond the classroom and
                even the campus, and treat you like part of a family. When you
                join Theta Tau you will make friendships that will last the rest
                of your life, anywhere you go.
              </div>
            )}
          </div>

          {/* Dropdown 6 */}
          <div className="pl-10 pr-10 mt-5">
            <button
              onClick={() => setFaq6Open(!faq6Open)}
              className="w-full h-[50px] flex justify-between items-center px-4 bg-gray-200 text-gray-800 font-semibold rounded-md hover:bg-gray-300"
            >
              How do you pronounce “Theta Tau”?
              <svg
                className={`w-[30px] h-[30px] transform transition-transform duration-300 ${
                  faq6Open ? "rotate-180" : ""
                }`}
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
            {faq6Open && (
              <div className="mt-2 p-4 bg-gray-100 rounded-md text-gray-700">
                THAY-Ta TAH. Notice the pronunciation of "Tau" differs from the
                typical pronunciation you might hear in a Math class. This is
                not by mistake, but rather a Greek Grammatical rule.
              </div>
            )}
          </div>
        </div>

        <div className="mt-5"></div>
      </div>
    </>
  );
}
