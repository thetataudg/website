"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { Bungee } from "next/font/google";
import Professional_ChiLine from "/public/Professional-ChiLine.jpg";
import Service from "/public/service_4.jpg";
import Brotherhood_Cookout from "/public/Brotherhood-Cookout.jpg";
import { SlArrowLeft, SlArrowRight } from "react-icons/sl";

const bungee = Bungee({
  subsets: ["latin"],
  display: "swap",
  weight: "400",
});

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

  useEffect(() => {
    const elements = Array.from(document.querySelectorAll(".reveal"));
    if (!elements.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("reveal-in");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px" }
    );

    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
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

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev === gallerySlides.length - 1 ? 0 : prev + 1));
    }, 5500);

    return () => clearInterval(interval);
  }, [gallerySlides.length]);

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
    <main className="bg-[#120a0a] pb-16 text-white">
      <section className="relative h-[420px] w-screen">
        <Image
          src="/Brotherhood-Beach.png"
          fill
          priority
          alt="Theta Tau members at the beach"
          className="object-cover object-[80%_30%]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/60 to-[#120a0a]" />
        <div className="relative z-10 flex h-full flex-col items-start justify-end px-6 pb-10 sm:px-12">
          <p className="text-sm uppercase tracking-[0.35em] text-[#f5d79a]">
            Our Core Values
          </p>
          <h1 className={`${bungee.className} mt-3 text-4xl text-[#b3202a] sm:text-6xl`}>
            Pillars
          </h1>
          <p className="mt-3 max-w-xl text-lg text-white/80">
            Professionalism, Brotherhood, and Service define who we are and how we grow.
          </p>
        </div>
      </section>

      <section className="mx-4 mt-12 rounded-[36px] bg-[#fbf6dc] px-8 py-12 text-[#1b0f0f] lg:mx-10 reveal">
        <div className="text-center">
          <h2 className={`${bungee.className} text-4xl text-[#7a0104]`}>
            The Pillars
          </h2>
          <p className="mt-3 text-base text-[#1b0f0f]/80">
            Three commitments that shape our chapter and guide every member’s journey.
          </p>
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-3">
          <div className="rounded-[28px] bg-[#120a0a] p-6 text-white shadow-[0_10px_24px_rgba(0,0,0,0.35)]" id="professionalism">
            <Image
              src={Professional_ChiLine}
              alt="Professionalism"
              className="h-[200px] w-full rounded-[22px] object-cover"
            />
            <h3 className={`${bungee.className} mt-6 text-2xl text-[#b3202a]`}>
              Professionalism
            </h3>
            <p className="mt-3 text-base text-white/85">
              We develop members into leaders through career preparation, strong
              communication, and lifelong professional networks.
            </p>
          </div>

          <div className="rounded-[28px] bg-[#120a0a] p-6 text-white shadow-[0_10px_24px_rgba(0,0,0,0.35)]" id="brotherhood">
            <Image
              src={Brotherhood_Cookout}
              alt="Brotherhood"
              className="h-[200px] w-full rounded-[22px] object-cover"
            />
            <h3 className={`${bungee.className} mt-6 text-2xl text-[#b3202a]`}>
              Brotherhood
            </h3>
            <p className="mt-3 text-base text-white/85">
              Our brotherhood is a family of engineers who grow together, celebrate
              together, and support each other for life.
            </p>
          </div>

          <div className="rounded-[28px] bg-[#120a0a] p-6 text-white shadow-[0_10px_24px_rgba(0,0,0,0.35)]" id="service">
            <Image
              src={Service}
              alt="Service"
              className="h-[200px] w-full rounded-[22px] object-cover"
            />
            <h3 className={`${bungee.className} mt-6 text-2xl text-[#b3202a]`}>
              Service
            </h3>
            <p className="mt-3 text-base text-white/85">
              We give back through outreach, philanthropy, and projects that create
              meaningful impact in our community.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-4 mt-10 rounded-[36px] bg-[#120a0a] px-8 py-12 text-white lg:mx-10 reveal">
        <div className="flex flex-col gap-4">
          <h2 className={`${bungee.className} text-3xl text-[#b3202a]`}>
            Gallery
          </h2>
          <p className="text-lg text-white/80">
            Discover the vibrant life of Theta Tau through professional events,
            service projects, and brotherhood gatherings.
          </p>
        </div>
        <div className="mt-8 h-[70vh] relative flex justify-center items-center group">
          <div
            style={{
              backgroundImage: `url(${gallerySlides[currentIndex].slide})`,
            }}
            className="w-full h-full bg-center bg-cover rounded-[28px] duration-500"
          >
            <div className="flex flex-col items-center lg:items-start justify-end gap-5 w-full h-full p-10 duration-500 relative">
              <p className={`${bungee.className} text-center text-white text-4xl backdrop-blur-3xl bg-black/40 border-2 border-[#e8b119] px-6 py-3 rounded-full`}>
                {gallerySlides[currentIndex].info}
              </p>
            </div>
          </div>
          <button
            className="absolute left-5 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-3 text-white transition hover:bg-black/70"
            onClick={prevSlide}
            aria-label="Previous slide"
          >
            <SlArrowLeft size={26} />
          </button>
          <button
            className="absolute right-5 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-3 text-white transition hover:bg-black/70"
            onClick={nextSlide}
            aria-label="Next slide"
          >
            <SlArrowRight size={26} />
          </button>
        </div>
      </section>
    </main>
  );
}
