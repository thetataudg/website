"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { Bungee } from "next/font/google";
import { SlArrowLeft, SlArrowRight } from "react-icons/sl";
import {
  FaAirbnb,
  FaAmazon,
  FaAndroid,
  FaApplePay,
  FaAppStore,
  FaAppStoreIos,
  FaAtlassian,
  FaAws,
  FaBehance,
  FaBitbucket,
  FaBootstrap,
  FaChrome,
  FaCloudflare,
  FaCodepen,
  FaDiscord,
  FaDocker,
  FaDribbble,
  FaDropbox,
  FaEdge,
  FaFacebookF,
  FaFigma,
  FaFirefox,
  FaGitAlt,
  FaGithub,
  FaGitlab,
  FaGoogle,
  FaGoogleDrive,
  FaGooglePay,
  FaGooglePlay,
  FaInstagram,
  FaIntercom,
  FaJava,
  FaJsSquare,
  FaLinkedinIn,
  FaLinux,
  FaMailchimp,
  FaMediumM,
  FaMicrosoft,
  FaNodeJs,
  FaNpm,
  FaOpera,
  FaPaypal,
  FaPinterestP,
  FaRedditAlien,
  FaSalesforce,
  FaSafari,
  FaSlack,
  FaSnapchatGhost,
  FaSoundcloud,
  FaSpotify,
  FaSteam,
  FaStripe,
  FaTiktok,
  FaTwitch,
  FaUber,
  FaUnity,
  FaVimeoV,
  FaWhatsapp,
  FaWindows,
  FaWordpress,
  FaXbox,
  FaYahoo,
  FaYoutube,
} from "react-icons/fa";
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
import AppleLogo from "/public/company_carousel/apple-14.svg";
import AllS from "/public/company_carousel/allstate-logo.svg";
import Accent from "/public/company_carousel/accenture-7.svg";

const XLogo = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
    <path
      fill="currentColor"
      d="m18.244 2h3.173l-6.925 7.92L22.5 22h-6.607l-5.172-6.229L4.9 22H1.726l7.39-8.451L1.5 2h6.773l4.676 5.64L18.244 2zm-1.11 18h1.758L7.852 3.91H5.967L17.134 20z"
    />
  </svg>
);

const bungee = Bungee({
  subsets: ["latin"],
  display: "swap",
  weight: "400",
});

type BrandItem =
  | {
      id: string;
      label: string;
      type: "svg";
      Logo: React.ComponentType<React.SVGProps<SVGSVGElement>>;
    }
  | {
      id: string;
      label: string;
      type: "icon";
      Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
      color?: string;
    };

export default function About() {
  const brandRows: BrandItem[][] = [
    [
      { id: "aws", label: "AWS", type: "svg", Logo: AWS },
      { id: "disney", label: "Disney", type: "svg", Logo: Disney },
      { id: "ford", label: "Ford", type: "svg", Logo: Ford },
      { id: "dod", label: "U.S. Department of Defense", type: "svg", Logo: DOD },
      { id: "playstation", label: "PlayStation", type: "svg", Logo: PS },
      { id: "brewers", label: "Milwaukee Brewers", type: "svg", Logo: MKB },
      { id: "northrop", label: "Northrop Grumman", type: "svg", Logo: NG },
      { id: "lockheed", label: "Lockheed Martin", type: "svg", Logo: LHM },
      { id: "intel", label: "Intel", type: "svg", Logo: Intel },
      { id: "honeywell", label: "Honeywell", type: "svg", Logo: HW },
      { id: "boeing", label: "Boeing", type: "svg", Logo: Boeing },
      { id: "apple", label: "Apple", type: "svg", Logo: AppleLogo },
      { id: "allstate", label: "Allstate", type: "svg", Logo: AllS },
      { id: "accenture", label: "Accenture", type: "svg", Logo: Accent },
    ],
    [
      { id: "amazon", label: "Amazon", type: "icon", Icon: FaAmazon, color: "#111111" },
      { id: "google", label: "Google", type: "icon", Icon: FaGoogle, color: "#4285F4" },
      { id: "microsoft", label: "Microsoft", type: "icon", Icon: FaMicrosoft, color: "#00A4EF" },
      { id: "linkedin", label: "LinkedIn", type: "icon", Icon: FaLinkedinIn, color: "#0A66C2" },
      { id: "github", label: "GitHub", type: "icon", Icon: FaGithub, color: "#181717" },
      { id: "facebook", label: "Facebook", type: "icon", Icon: FaFacebookF, color: "#1877F2" },
      { id: "instagram", label: "Instagram", type: "icon", Icon: FaInstagram, color: "#E1306C" },
      { id: "x", label: "X", type: "svg", Logo: XLogo },
      { id: "youtube", label: "YouTube", type: "icon", Icon: FaYoutube, color: "#FF0000" },
      { id: "snapchat", label: "Snapchat", type: "icon", Icon: FaSnapchatGhost, color: "#FFFC00" },
      { id: "reddit", label: "Reddit", type: "icon", Icon: FaRedditAlien, color: "#FF4500" },
      { id: "pinterest", label: "Pinterest", type: "icon", Icon: FaPinterestP, color: "#E60023" },
      { id: "paypal", label: "PayPal", type: "icon", Icon: FaPaypal, color: "#003087" },
      { id: "stripe", label: "Stripe", type: "icon", Icon: FaStripe, color: "#635BFF" },
      { id: "uber", label: "Uber", type: "icon", Icon: FaUber, color: "#000000" },
      { id: "airbnb", label: "Airbnb", type: "icon", Icon: FaAirbnb, color: "#FF5A5F" },
      { id: "spotify", label: "Spotify", type: "icon", Icon: FaSpotify, color: "#1DB954" },
      { id: "slack", label: "Slack", type: "icon", Icon: FaSlack, color: "#4A154B" },
      { id: "discord", label: "Discord", type: "icon", Icon: FaDiscord, color: "#5865F2" },
      { id: "twitch", label: "Twitch", type: "icon", Icon: FaTwitch, color: "#9146FF" },
    ],
    [
      { id: "aws-icon", label: "AWS", type: "icon", Icon: FaAws, color: "#232F3E" },
      { id: "android", label: "Android", type: "icon", Icon: FaAndroid, color: "#3DDC84" },
      { id: "apple-pay", label: "Apple Pay", type: "icon", Icon: FaApplePay, color: "#111111" },
      { id: "app-store", label: "App Store", type: "icon", Icon: FaAppStore, color: "#0D96F6" },
      { id: "app-store-ios", label: "App Store iOS", type: "icon", Icon: FaAppStoreIos, color: "#0D96F6" },
      { id: "google-pay", label: "Google Pay", type: "icon", Icon: FaGooglePay, color: "#4285F4" },
      { id: "google-play", label: "Google Play", type: "icon", Icon: FaGooglePlay, color: "#34A853" },
      { id: "google-drive", label: "Google Drive", type: "icon", Icon: FaGoogleDrive, color: "#0F9D58" },
      { id: "chrome", label: "Chrome", type: "icon", Icon: FaChrome, color: "#DB4437" },
      { id: "firefox", label: "Firefox", type: "icon", Icon: FaFirefox, color: "#FF7139" },
      { id: "edge", label: "Edge", type: "icon", Icon: FaEdge, color: "#0078D7" },
      { id: "safari", label: "Safari", type: "icon", Icon: FaSafari, color: "#0FB5EE" },
      { id: "opera", label: "Opera", type: "icon", Icon: FaOpera, color: "#FF1B2D" },
      { id: "dropbox", label: "Dropbox", type: "icon", Icon: FaDropbox, color: "#0061FF" },
      { id: "gitlab", label: "GitLab", type: "icon", Icon: FaGitlab, color: "#FC6D26" },
      { id: "bitbucket", label: "Bitbucket", type: "icon", Icon: FaBitbucket, color: "#2684FF" },
      { id: "figma", label: "Figma", type: "icon", Icon: FaFigma, color: "#F24E1E" },
      { id: "atlassian", label: "Atlassian", type: "icon", Icon: FaAtlassian, color: "#0052CC" },
      { id: "mailchimp", label: "Mailchimp", type: "icon", Icon: FaMailchimp, color: "#FFE01B" },
      { id: "wordpress", label: "WordPress", type: "icon", Icon: FaWordpress, color: "#21759B" },
      { id: "yahoo", label: "Yahoo", type: "icon", Icon: FaYahoo, color: "#6001D2" },
      { id: "soundcloud", label: "SoundCloud", type: "icon", Icon: FaSoundcloud, color: "#FF5500" },
      { id: "steam", label: "Steam", type: "icon", Icon: FaSteam, color: "#171A21" },
      { id: "xbox", label: "Xbox", type: "icon", Icon: FaXbox, color: "#107C10" },
      { id: "nodejs", label: "Node.js", type: "icon", Icon: FaNodeJs, color: "#339933" },
      { id: "npm", label: "npm", type: "icon", Icon: FaNpm, color: "#CB3837" },
      { id: "js", label: "JavaScript", type: "icon", Icon: FaJsSquare, color: "#F7DF1E" },
      { id: "java", label: "Java", type: "icon", Icon: FaJava, color: "#007396" },
      { id: "linux", label: "Linux", type: "icon", Icon: FaLinux, color: "#FCC624" },
      { id: "windows", label: "Windows", type: "icon", Icon: FaWindows, color: "#0078D7" },
      { id: "unity", label: "Unity", type: "icon", Icon: FaUnity, color: "#111111" },
      { id: "behance", label: "Behance", type: "icon", Icon: FaBehance, color: "#1769FF" },
      { id: "dribbble", label: "Dribbble", type: "icon", Icon: FaDribbble, color: "#EA4C89" },
      { id: "medium", label: "Medium", type: "icon", Icon: FaMediumM, color: "#111111" },
      { id: "intercom", label: "Intercom", type: "icon", Icon: FaIntercom, color: "#1F8DED" },
      { id: "salesforce", label: "Salesforce", type: "icon", Icon: FaSalesforce, color: "#00A1E0" },
      { id: "bootstrap", label: "Bootstrap", type: "icon", Icon: FaBootstrap, color: "#7952B3" },
      { id: "cloudflare", label: "Cloudflare", type: "icon", Icon: FaCloudflare, color: "#F38020" },
      { id: "codepen", label: "CodePen", type: "icon", Icon: FaCodepen, color: "#000000" },
      { id: "git-alt", label: "Git", type: "icon", Icon: FaGitAlt, color: "#F05032" },
      { id: "vimeo", label: "Vimeo", type: "icon", Icon: FaVimeoV, color: "#1AB7EA" },
      { id: "whatsapp", label: "WhatsApp", type: "icon", Icon: FaWhatsapp, color: "#25D366" },
      { id: "tiktok", label: "TikTok", type: "icon", Icon: FaTiktok, color: "#010101" },
    ],
  ];

  const gallerySlides = [
    { slide: "/carousel/BobRossNight.jpg", info: "Bob Ross Night" },
    { slide: "/carousel/FinalsStudyRoom.jpg", info: "Study Sessions for Finals" },
    { slide: "/carousel/GameNight.jpg", info: "Game Nights" },
    { slide: "/carousel/NobleNights.jpg", info: "Weekly Noble Nights" },
    { slide: "/carousel/ParkCleanup.jpg", info: "Local Park Cleanup" },
    { slide: "/carousel/Banquet.jpg", info: "Banquet Night" },
    { slide: "/carousel/ChapterPhoto.jpg", info: "Delta Gamma Chapter" },
    { slide: "/carousel/OpenDoor.jpg", info: "ASU Open Door" },
    { slide: "/carousel/PieABrother.jpg", info: "Pie-A-Brother" },
    { slide: "/carousel/TrickOrCanning.jpg", info: "Trick Or Canning" },
  ];

  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) =>
        prev === gallerySlides.length - 1 ? 0 : prev + 1
      );
    }, 5500);

    return () => clearInterval(interval);
  }, [gallerySlides.length]);

  const prevSlide = () => {
    const isFirstSlide = currentIndex === 0;
    setCurrentIndex(isFirstSlide ? gallerySlides.length - 1 : currentIndex - 1);
  };

  const nextSlide = () => {
    const isLastSlide = currentIndex === gallerySlides.length - 1;
    setCurrentIndex(isLastSlide ? 0 : currentIndex + 1);
  };

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

  const renderBrandRow = (items: BrandItem[]) => (
    <>
      <div className="logo-marquee__row">
        {items.map((item, index) => (
          <span key={`${item.id}-${index}`} className="logo-marquee__tile" title={item.label}>
            {item.type === "svg" ? (
              <item.Logo className="logo-marquee__mark" />
            ) : (
              <item.Icon
                className="logo-marquee__icon"
                style={{ color: item.color ?? "#1b0f0f" }}
              />
            )}
          </span>
        ))}
      </div>
      <div className="logo-marquee__row" aria-hidden="true">
        {items.map((item, index) => (
          <span
            key={`${item.id}-dupe-${index}`}
            className="logo-marquee__tile"
            title={item.label}
          >
            {item.type === "svg" ? (
              <item.Logo className="logo-marquee__mark" />
            ) : (
              <item.Icon
                className="logo-marquee__icon"
                style={{ color: item.color ?? "#1b0f0f" }}
              />
            )}
          </span>
        ))}
      </div>
    </>
  );

  return (
    <main className="bg-[#120a0a] pb-16 text-white">
      <section className="relative min-h-[65vh] w-full">
        <Image
          src="/prof_1.JPG"
          fill
          priority
          alt="Theta Tau members in professional attire"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/60 to-[#120a0a]" />
        <div className="relative z-10 flex min-h-[65vh] flex-col items-start justify-end px-6 pb-12 sm:px-12">
          <p className="text-sm uppercase tracking-[0.35em] text-[#f5d79a]">
            Delta Gamma Chapter
          </p>
          <h1 className={`${bungee.className} mt-3 text-4xl text-[#b3202a] sm:text-6xl`}>
            About Theta Tau
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-white/85">
            Learn more about the Delta Gamma Chapter at Arizona State University.
          </p>
        </div>
      </section>

      <section className="mx-4 mt-12 rounded-[36px] bg-[#fbf6dc] px-8 py-12 text-[#1b0f0f] lg:mx-10 reveal">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[1.1fr,1fr]">
          <div className="space-y-4">
            <h2 className={`${bungee.className} text-3xl text-[#7a0104]`}>
              Who We Are
            </h2>
            <p className="text-lg">
              Theta Tau is the nation’s oldest and largest professional engineering
              fraternity. Our Delta Gamma chapter at Arizona State University is a
              close-knit brotherhood built on professional growth, community impact,
              and lifelong friendships.
            </p>
            <p className="text-lg">
              Established in 1995, we are home to active members who support one
              another in academics, leadership development, and service while building
              relationships that last well beyond graduation.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Image
              alt="Chapter group photo"
              src="/group_1.jpg"
              width={520}
              height={640}
              className="h-full w-full rounded-[28px] object-cover"
            />
            <div className="flex flex-col gap-4">
              <Image
                alt="Chapter event"
                src="/group_2.jpg"
                width={520}
                height={320}
                className="h-full w-full rounded-[28px] object-cover"
              />
              <Image
                alt="Brotherhood moment"
                src="/group_3.jpg"
                width={520}
                height={320}
                className="h-full w-full rounded-[28px] object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-4 mt-10 rounded-[36px] bg-[#120a0a] px-8 py-12 text-white lg:mx-10 reveal">
        <div className="mx-auto max-w-5xl text-center">
          <p className="text-xs uppercase tracking-[0.45em] text-[#f5d79a]">
            Our Pillars
          </p>
          <h2 className={`${bungee.className} mt-4 text-4xl text-[#b3202a] sm:text-5xl`}>
            Professionalism, Service, Brotherhood
          </h2>
          <p className="mt-5 text-base text-white/80">
            Theta Tau’s mission is centered on three pillars; Professionalism,
            Service, and Brotherhood, each of which plays a distinct and essential role
            in shaping members into well-rounded engineers and leaders. These pillars
            are interconnected values that guide how members grow, act, and support
            one another.
          </p>
        </div>

        <div className="mt-12 space-y-10">
          <article
            id="professionalism"
            className="group reveal overflow-hidden rounded-[32px] border border-white/5 bg-[#1b0f0f] shadow-[0_18px_36px_rgba(0,0,0,0.45)]"
            style={{ transitionDelay: "0ms" }}
          >
            <div className="grid gap-8 lg:grid-cols-[1.1fr,0.9fr]">
              <div className="p-8 lg:p-10">
                <p className="text-xs uppercase tracking-[0.4em] text-[#f5d79a]">
                  Professionalism
                </p>
                <h3 className={`${bungee.className} mt-4 text-3xl text-[#b3202a]`}>
                  Crafting engineers with integrity.
                </h3>
                <p className="mt-4 text-sm text-white/80">
                  Professional Development prepares members for success in engineering
                  and beyond. It emphasizes technical competence, ethical responsibility,
                  leadership, and effective communication while reinforcing the expectation
                  that members represent the fraternity and the engineering profession
                  with integrity.
                </p>
                <p className="mt-4 text-sm text-white/75">
                  Through hands-on projects, professional workshops, resume and interview
                  preparation, and networking with alumni and industry professionals,
                  members grow in confidence, accountability, and career readiness.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  {[
                    "Workshops & speaker series",
                    "Resume + interview prep",
                    "Alumni & industry mentors",
                    "Leadership development",
                  ].map((item) => (
                    <span
                      key={item}
                      className="rounded-full border border-white/10 px-4 py-2 text-xs uppercase tracking-[0.3em] text-white/70"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
              <div className="relative min-h-[260px]">
                <Image
                  src="/ec.JPG"
                  alt="Professional Development"
                  fill
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
              </div>
            </div>
          </article>

          <article
            id="service"
            className="group reveal overflow-hidden rounded-[32px] border border-white/5 bg-[#1b0f0f] shadow-[0_18px_36px_rgba(0,0,0,0.45)]"
            style={{ transitionDelay: "120ms" }}
          >
            <div className="grid gap-8 lg:grid-cols-[0.9fr,1.1fr]">
              <div className="relative min-h-[260px] order-2 lg:order-1">
                <Image
                  src="/service.jpg"
                  alt="Service"
                  fill
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
              </div>
              <div className="p-8 lg:p-10 order-1 lg:order-2">
                <p className="text-xs uppercase tracking-[0.4em] text-[#f5d79a]">
                  Service
                </p>
                <h3 className={`${bungee.className} mt-4 text-3xl text-[#b3202a]`}>
                  Engineering with heart.
                </h3>
                <p className="mt-4 text-sm text-white/80">
                  Service reflects Theta Tau’s commitment to using engineering knowledge
                  and teamwork to benefit others. This pillar emphasizes giving back to
                  local communities, supporting philanthropic causes, and applying technical
                  skills to solve real-world problems.
                </p>
                <p className="mt-4 text-sm text-white/75">
                  Beyond technical service, it promotes empathy, social responsibility,
                  and the belief that engineers can positively influence the world.
                </p>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {[
                    "STEM outreach",
                    "Community cleanups",
                    "Philanthropy partnerships",
                    "Hands-on service builds",
                  ].map((item) => (
                    <div
                      key={item}
                      className="rounded-[18px] border border-white/10 px-4 py-3 text-xs uppercase tracking-[0.3em] text-white/70"
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </article>

          <article
            id="brotherhood"
            className="group reveal overflow-hidden rounded-[32px] border border-white/5 bg-[#1b0f0f] shadow-[0_18px_36px_rgba(0,0,0,0.45)]"
            style={{ transitionDelay: "240ms" }}
          >
            <div className="grid gap-8 lg:grid-cols-[1.1fr,0.9fr]">
              <div className="p-8 lg:p-10">
                <p className="text-xs uppercase tracking-[0.4em] text-[#f5d79a]">
                  Brotherhood
                </p>
                <h3 className={`${bungee.className} mt-4 text-3xl text-[#b3202a]`}>
                  A lifelong community.
                </h3>
                <p className="mt-4 text-sm text-white/80">
                  Brotherhood is the foundation that connects all members and strengthens
                  the fraternity as a whole. It emphasizes trust, respect, inclusivity,
                  and mutual support so members feel valued academically, professionally,
                  and personally.
                </p>
                <p className="mt-4 text-sm text-white/75">
                  Through shared experiences and accountability, members build relationships
                  that last beyond college, creating a lifelong community.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  {[
                    "Big-little mentorships",
                    "Pledge class bonds",
                    "Family lineages",
                    "Shared traditions",
                  ].map((item) => (
                    <span
                      key={item}
                      className="rounded-full border border-white/10 px-4 py-2 text-xs uppercase tracking-[0.3em] text-white/70"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
              <div className="relative min-h-[260px]">
                <Image
                  src="/fun.jpg"
                  alt="Brotherhood"
                  fill
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
              </div>
            </div>
          </article>
        </div>
      </section>

      <section className="mx-4 mt-10 rounded-[36px] bg-[#fbf6dc] px-8 py-12 text-[#1b0f0f] lg:mx-10 reveal">
        <div className="grid gap-10 lg:grid-cols-[1.1fr,0.9fr]">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-[#7a0104]">
              National History
            </p>
            <h2 className={`${bungee.className} mt-4 text-4xl text-[#b3202a]`}>
              Since 1904
            </h2>
            <p className="mt-4 text-base text-[#1b0f0f]/80">
              Theta Tau is the oldest and largest co-ed professional engineering
              fraternity in the United States. Founded at the University of
              Minnesota in 1904, the organization has shaped engineering students
              and professionals through brotherhood, professional development, and
              service.
            </p>
            <p className="mt-4 text-base text-[#1b0f0f]/80">
              Our Delta Gamma chapter is part of Theta Tau’s Western Region, a
              network of chapters and colonies across the Southwest and West Coast
              that collaborate, share traditions, and support each other.
            </p>
            <p className="mt-4 text-base text-[#1b0f0f]/80">
              From its founding by engineering students, Theta Tau has grown into
              a nationwide network that still centers the same mission: developing
              leaders for service, profession, and society. That legacy shows up
              in the way chapters invest in mentorship, ethics, and real-world
              engineering impact.
            </p>
            <p className="mt-4 text-base text-[#1b0f0f]/80">
              Delta Gamma carries that tradition forward by building campus
              partnerships, creating professional opportunities, and showing up
              for the communities we serve. The result is a brotherhood rooted in
              history and driven by what we do today.
            </p>
          </div>
          <div className="rounded-[28px] bg-white p-6 shadow-[0_10px_24px_rgba(0,0,0,0.12)]">
            <h3 className={`${bungee.className} text-2xl text-[#7a0104]`}>
              Western Region Chapters
            </h3>
            <ul className="mt-4 space-y-2 text-sm text-[#1b0f0f]/80">
              <li>Chi Chapter (University of Arizona)</li>
              <li>Delta Gamma Chapter (Arizona State University)</li>
              <li>Epsilon Chapter (University of California, Berkeley)</li>
              <li>Epsilon Delta Chapter (University of California, San Diego)</li>
              <li>Kappa Epsilon Chapter (University of Southern California)</li>
              <li>Lambda Delta Chapter (University of the Pacific)</li>
              <li>Lambda Epsilon Chapter (University of San Diego)</li>
              <li>Mu Delta Chapter (University of California, Merced)</li>
              <li>Omicron Epsilon Chapter (Northern Arizona University)</li>
              <li>Omicron Gamma Chapter (University of California, Davis)</li>
              <li>Phi Epsilon (California State University, Fullerton)</li>
              <li>Pi Delta Chapter (University of California, Irvine)</li>
              <li>Rho Delta Chapter (University of Nevada, Reno)</li>
              <li>Sigma Delta Chapter (University of California, Riverside)</li>
              <li>Sigma Epsilon Chapter (University of California, Santa Barbara)</li>
              <li>Upsilon Delta Chapter (University of California, Los Angeles)</li>
              <li>Upsilon Epsilon (Santa Clara University)</li>
              <li>Xi Epsilon Chapter (California State University, Long Beach)</li>
            </ul>
            <h4 className="mt-6 text-xs uppercase tracking-[0.35em] text-[#7a0104]">
              Colonies
            </h4>
            <ul className="mt-3 space-y-2 text-sm text-[#1b0f0f]/80">
              <li>University of Nevada, Las Vegas Colony of Theta Tau</li>
              <li>University of Washington Colony</li>
            </ul>
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
        <div className="mt-8 relative h-[70vh]">
          <div
            style={{
              backgroundImage: `url(${gallerySlides[currentIndex].slide})`,
            }}
            className="h-full w-full rounded-[28px] bg-cover bg-center duration-500"
          >
            <div className="flex h-full w-full items-end justify-center p-10">
              <p
                className={`${bungee.className} text-center text-white text-3xl backdrop-blur-2xl bg-black/45 border-2 border-[#e8b119] px-6 py-3 rounded-full`}
              >
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

      <section className="mx-4 mt-10 rounded-[36px] bg-[#fbf6dc] px-8 py-12 text-[#1b0f0f] lg:mx-10 reveal">
        <div className="text-center">
          <h2 className={`${bungee.className} text-3xl text-[#7a0104]`}>
            Where We’ve Worked
          </h2>
          <p className="mt-3 text-base text-[#1b0f0f]/80">
            Our brothers bring their skills to leading companies across industries.
          </p>
        </div>
        <div className="mt-8">
          <div className="logo-marquee">
            <div className="logo-marquee__track">
              {renderBrandRow(brandRows[0])}
            </div>
            <div className="logo-marquee__track logo-marquee__track--reverse">
              {renderBrandRow(brandRows[1])}
            </div>
            <div className="logo-marquee__track">
              {renderBrandRow(brandRows[2])}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
