"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import Professional_ChiLine from "/public/Professional-ChiLine.jpg";
import Service_BikeSaviors from "/public/Service-BikeSaviors.jpg";
import Brotherhood_Cookout from "/public/Brotherhood-Cookout.jpg";
import { SlArrowLeft, SlArrowRight } from "react-icons/sl";
import Carousel from "react-bootstrap/Carousel";

export default function Pillars() {
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

  const gallerySlides = [
    {
      slide: "/carousel/BobRossNight.jpg",
      info: "Bob Ross Night",
    },
    {
      slide: "/carousel/FinalsStudyRoom.jpg",
      info: "Study Sessions for Finals",
    },
    {
      slide: "/carousel/GameNight.jpg",
      info: "Game Nights",
    },
    {
      slide: "/carousel/NobleNights.jpg",
      info: "Weekly Noble Nights",
    },
    {
      slide: "/carousel/ParkCleanup.jpg",
      info: "Local Park Cleanup",
    },
    {
      slide: "/carousel/Banquet.jpg",
      info: "Banquet Night",
    },
    {
      slide: "/carousel/ChapterPhoto.jpg",
      info: "Delta Gamma Chapter",
    },
    {
      slide: "/carousel/OpenDoor.jpg",
      info: "ASU Open Door",
    },
    {
      slide: "/carousel/PieABrother.jpg",
      info: "Pie-A-Brother",
    },
    {
      slide: "/carousel/TrickOrCanning.jpg",
      info: "Trick Or Canning",
    },
  ];

  const [currentIndex, setCurrentIndex] = useState(0);

  const prevSlide = () => {
    const isFirstSlide = currentIndex === 0;
    const newIndex = isFirstSlide ? gallerySlides.length - 1 : currentIndex - 1;
    setCurrentIndex(newIndex);
  };

  const nextSlide = () => {
    const isLastSlide = currentIndex === gallerySlides.length - 1;
    const newIndex = isLastSlide ? 0 : currentIndex + 1;
    setCurrentIndex(newIndex);
  };

  return (
    <>
      <div
        className="relative w-screen h-[400px] bg-red-parallax bg-fixed bg-no-repeat bg-cover bg-center z-0 parallax-bg align-l
      text-white flex flex-col items-start justify-end h-[100%] pb-10 font-sans"
      >
        <h1
          className={`text-white text-[13vw] md:text-[95px] ml-[5%] font-bold`}
        >
          Pillars
        </h1>
        <h2 className="text-white text-[4vw] md:text-[30px] ml-[5%]">
          Theta Tau's Core Values
        </h2>
      </div>

      <div className="w-[100%]">
        <div
          className="w-[100%] flex lg:flex-row lg:gap-10 lg:p-10 md:p-10 sm:p-5 flex-col"
          id="professionalism"
        >
          <div className="lg:w-[60%] flex flex-col gap-3 items-left justify-center w-[100%] p-5 lg:p-0 md:p-0">
            <h1 className="text-[30px] font-extrabold text-[#7a0104]">
              Professionalism
            </h1>
            <p className="text-[13px] xl:text-[20px] font-light">
              In Theta Tau we are dedicated to growing our members both in and
              outside the classroom, and jump starting our members’ careers. We
              seek to develop our members into leaders in engineering and our
              community, and building personal and professional networks which
              will last a lifetime.
            </p>
          </div>
          <div className="lg:w-[40%] w-[100%] p-5 lg:p-0 lg:flex lg:flex-row lg:justify-end lg:items-center  lg:border-l-8 lg:border-[#7a0104]">
            <Image
              src={Professional_ChiLine}
              alt="Chiline"
              className=" lg:w-[90%] lg:h-[auto] md:w-[80%] w-[100%]"
            />
          </div>
        </div>

        <div
          className="w-[100%] flex lg:flex-row lg:gap-10 lg:p-10 md:p-10 sm:p-5 flex-col-reverse bg-[#e0e0e0]"
          id="brotherhood"
        >
          <div className="lg:w-[40%] w-[100%] p-5 lg:p-0 lg:flex lg:flex-row lg:justify-start lg:items-center lg:border-r-8 lg:border-[#7a0104]">
            <Image
              src={Brotherhood_Cookout}
              alt="Service"
              className=" lg:w-[90%] lg:h-[auto] w-[100%]"
            />
          </div>
          <div className="lg:w-[60%] flex flex-col gap-3 items-left justify-center w-[100%] p-5 lg:p-0 md:p-0">
            <h1 className="text-[30px] font-extrabold text-[#7a0104]">
              Brotherhood
            </h1>
            <p className="text-[13px] xl:text-[20px] font-light">
              Joining Theta Tau is like joining a family of over 40,000 honest,
              talented, and dependable men and women who all have an engineering
              mindset. You will form bonds and friendships which will last your
              entire life. You have friends you have never met in any city you
              move to. Your brothers will be there when times are hard, and your
              brothers will be there at your wedding. Your brothers will always
              be there, because your brothers in Theta Tau are your family.
            </p>
          </div>
        </div>

        <div
          className="w-[100%] flex lg:flex-row lg:gap-10 lg:p-10 md:p-10 sm:p-5 flex-col"
          id="service"
        >
          <div className="lg:w-[60%] flex flex-col gap-3 items-left justify-center w-[100%] p-5 lg:p-0 md:p-0">
            <h1 className="text-[30px] font-extrabold text-[#7a0104]">
              Service
            </h1>
            <p className="text-[13px] xl:text-[20px] font-light">
              Our members love giving back to the community. Every year there
              are national efforts where brothers from across the nation unite
              to help our communities. These efforts include activities like
              Habitat for Humanity and participating in clothing and food
              drives.
            </p>
          </div>
          <div className="lg:w-[40%] w-[100%] p-5 lg:p-0 lg:flex lg:flex-row lg:justify-end lg:items-center lg:border-l-8 lg:border-[#7a0104]">
            <Image
              src={Service_BikeSaviors}
              alt="Service"
              className=" lg:w-[90%] lg:h-[auto] w-[100%]"
            />
          </div>
        </div>

        <div className="w-[100%] flex flex-col lg:gap-10 lg:p-20 md:p-10 sm:p-5 bg-[#e0e0e0]">
          <div className=" flex flex-col gap-3 items-left justify-center w-[100%] p-5 lg:p-0 md:p-0">
            <h1 className="text-[30px] font-extrabold text-[#7a0104]">
              Gallery
            </h1>
            <p className="text-[13px] xl:text-[20px] font-light">
              Discover the vibrant life of Theta Tau through our gallery. From
              professional events and service projects to brotherhood
              gatherings, see the moments that define our fraternity.
            </p>
          </div>
          <div className=" h-[70vh] relative flex justify-center items-center group pt-5 lg:pt-0">
            <div
              style={{
                backgroundImage: `url(${gallerySlides[currentIndex].slide})`,
              }}
              className="w-[100%] h-full bg-center bg-cover lg:rounded-xl duration-500"
            >
              <div className="flex flex-col items-center lg:items-start justify-end gap-5 w-[100%] h-[100%] p-10 duration-500 relative">
                <p className="text-center text-white text-5xl backdrop-blur-3xl bg-black/30 font-light border-4 border-[#e8b119] border-spacing-y-3 p-3 ">
                  {gallerySlides[currentIndex].info}
                </p>
              </div>
            </div>
            <div className="group-hover:block absolute top-[45%] -translate-x-0 translate-y-[45%] left-5 text-2xl rounded-full p-2 bg-transparent text-white cursor-pointer duration-200">
              <SlArrowLeft size={40} onClick={prevSlide} />
            </div>
            <div className="group-hover:block absolute top-[45%] -translate-x-0 translate-y-[45%] right-5 text-2xl rounded-full p-2 bg-transparent text-white cursor-pointer duration-200">
              <SlArrowRight size={40} onClick={nextSlide} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
