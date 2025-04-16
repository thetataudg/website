import Image from "next/image";
import { Bungee } from "next/font/google";

import { FaUsers, FaGraduationCap, FaBuilding } from "react-icons/fa"

const bungee = Bungee({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-bungee",
  weight: "400"
});

export default function Home() {
  return (
    <main>
      {/* Hero Image */}
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "900px",
        }}
      >
        {/* Home Page Picture */}
        <Image
          src="/TauGamma-Gradient.jpg" // Image source path
          layout="fill" // Fill the container
          objectFit="cover" // Cover the container while maintaining aspect ratio
          alt="ASU Theta Tau members standing in professional dress" // Alt text for accessibility
          style={{ filter: "brightness(60%)", zIndex: -1 }} // Lower opacity to 70%
        />
        {/* Theta Tau Text */}
        <div
          style={{
            position: "absolute",
            top: "300px", // Adjust as needed
            left: "50%",
            transform: "translateX(-50%)",
            textAlign: "center",
            fontSize: "75px", // Relative to viewport width (adjust as needed)
            lineHeight: "80%"
          }}
        >
          <h1 className={`${bungee.className} antialiased text-tt-dark-red font-weight-bold`}>
            Forging Future Engineers
          </h1>
          <p className="pt-10 text-white leading-tight">
            Nation's Foremost Professional Engineering Fraternity
          </p>
        </div>

        {/* Chapter Name and Location */}
        <div
          className="lg:top-[500px]"
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            color: "white",
            backgroundColor: "rgba(0, 0, 0, 0)"
          }}
        >
        </div>
      </div>

      {/* Who We Are Section */}
      <div
        className="py-10 bg-black"
      >
        <h1 className={`${bungee.className} antialiased text-tt-dark-red text-center font-weight-bold pb-10`}>
          Who We Are
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="px-[60px] lg:px-[100px]">
            <div
              style={{
                display: "flex",
                justifyContent: "left",
                alignItems: "center"
              }}
            >
              <Image
                className="hidden pr-5 lg:inline"
                src="/white_bar.png"
                alt=""
                width="200"
                height="15"
              />
              <span className="ml-auto mr-auto lg:ml-0 text-white text-[20px]">
                Since 1904
              </span>
            </div>
            <h1 className={`${bungee.className} text-center lg:text-left text-5xl lg:text-[58px] antialiased text-tt-dark-red font-weight-bold pb-4`}>
                We Are Theta Tau
            </h1>
            <p className="text-white pb-8">
              Theta Tau is a co-ed professional engineering fraternity here at Arizona State University. We are a close knit brotherhood that encourages our members to excel professionally and give back to the surrounding community.
            </p>
              <div className="grid grid-cols-1 gap-4">
                <a href="/rush" className="tt-button-primary hover:bg-tt-dark-red hover:text-tt-gold text-center">
                  Rush Theta Tau
                </a>
                <a href="/about" className="tt-button-secondary hover:bg-tt-gold hover:text-black text-center">
                  Learn More
                </a>
              </div>
          </div>
          <div>
            <Image
              className="ml-auto mr-auto"
              src="/Polaroids.png"
              width="583"
              height="454"
              alt="Polaroid photos of Theta Tau members"
            />
          </div>
        </div>
      </div>
      {/* Our Values Section */}
      <div className="text-center bg-[#fdfcdc] rounded py-10">
        <h1 className={`${bungee.className} text-tt-dark-red`}>
          Our Values
        </h1>

        {/* Professionalism */}
        <div
          className="bg-black ml-auto mr-auto"
          style={{
            width: "80%",
            borderRadius: "10px"
          }}
        >
          <div className="m-10 grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="mb-6 lg:my-10 lg:col-span-7">
              <h2 className={`${bungee.className} text-[6vw] md:text-[40px] text-tt-dark-red text-center my-5`}>
                Professionalism
              </h2>
              <p className="text-[15px] lg:text-[20px] text-white text-center mb-10">
                Theta Tau cultivates and enhances engineers' communication, problem-solving, and leadership skills, empowering them to excel professionally, contribute to their communities, and lead impactful careers and lives.
              </p>
              <a href="/pillars#professionalism" className="tt-button-secondary hover:bg-tt-gold hover:text-black mr-5">
                Learn More
              </a>
            </div>
            <div className="mt-6 lg:my-10 lg:col-span-5 force-align-center">
              <Image
                alt=""
                src="/Homepage-Professional.png"
                width="449"
                height="334"
                className="mb-5"
              />
            </div>
          </div>
        </div>

        {/* Brotherhood */}
        <div
          className="bg-black ml-auto mr-auto"
          style={{
            width: "80%",
            borderRadius: "10px"
          }}
        >
          <div className="m-10 grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="mt-6 lg:my-10 lg:col-span-5 force-align-center">
              <Image
                alt=""
                src="/Homepage-Brotherhood.png"
                width="449"
                height="334"
              />
            </div>
            <div className="mb-6 lg:my-10 lg:col-span-7">
              <h2 className={`${bungee.className} text-[6vw] md:text-[40px] text-tt-dark-red text-center my-5`}>
                Brotherhood
              </h2>
              <p className="text-white text-center mb-10">
                Theta Tau fosters a strong sense of brotherhood by uniting members through shared values, collaborative efforts, and lifelong friendships, creating a supportive and empowering community for aspiring engineers.
              </p>
              <a href="/pillars#brotherhood" className="tt-button-secondary hover:bg-tt-gold hover:text-black mr-5"> {/* Eventually change this to "meet the brothers" */}
                Learn More
              </a>
            </div>
          </div>
        </div>

        {/* Service */}
        <div
          className="bg-black ml-auto mr-auto"
          style={{
            width: "80%",
            borderRadius: "10px"
          }}
        >
          <div className="m-10 grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="mb-6 lg:my-10 lg:col-span-7">
              <h2 className={`${bungee.className} text-[6vw] md:text-[40px] text-tt-dark-red text-center my-5`}>
                Service
              </h2>
              <p className="text-white text-center mb-10">
                Theta Tau members exemplify a strong sense of service by consistently dedicating their time and skills to community outreach and philanthropic initiatives, striving to create lasting and meaningful positive change in the world around them.
              </p>
              <a href="/pillars#service" className="tt-button-secondary hover:bg-tt-gold hover:text-black mr-5">
                Learn More
              </a>
            </div>
            <div className="mt-6 lg:my-10 lg:col-span-5 force-align-center">
              <Image
                alt=""
                src="/Homepage-Service.png"
                width="449"
                height="334"
                className="mb-5"
              />
            </div>
          </div>
        </div>

        <hr
          className="hidden mr-auto ml-auto lg:block"
          style={{
            width: "50%",
            height: "6px",
            backgroundColor: "#ad2730"
          }} 
        />


        <div
          className="bg-black mr-auto ml-auto my-5"
          style={{
            width: "60%",
            color: "white",
            borderRadius: "10px"
          }}
        >
          <div className="m-10 grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="mb-6 lg:my-10 lg:col-span-1">
              <FaUsers className="ml-auto mr-auto" color={"#e2ab16ff"} size={80} />
              <h2 className={`${bungee.className} text-center`}>50+</h2>
              <h3 className="text-center">ACTIVES</h3>
            </div>
            <div className="ml-auto mr-auto mb-6 lg:my-10 lg:col-span-1">
              <FaGraduationCap className="ml-auto mr-auto" color={"#e2ab16ff"} size={80} />
              <h2 className={`${bungee.className} text-center`}>200+</h2>
              <h3 className="text-center">ALUMNI</h3>
            </div>
            <div className="ml-auto mr-auto mb-6 lg:my-10 lg:col-span-1">
              <FaBuilding className="ml-auto mr-auto" color={"#e2ab16ff"} size={75} />
              <h2 className={`${bungee.className} text-center`}>90+</h2>
              <h3 className="text-center">CHAPTERS</h3>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
