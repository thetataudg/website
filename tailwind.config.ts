import { transform } from "next/dist/build/swc";
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      animation: {
        "loop-scroll": "loop-scroll 50s linear infinite",
      },
      keyframes: {
        "loop-scroll": {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-100%)" },
        },
      },
      colors: {
        "tt-dark-red": "#ad2831",
        "tt-gold": "#e3b11a",
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
        "pillars-parallax": "url('/public/Pillars.jpg')",
        "grey-parallax": "url('/public/RushBackground.png')",
        "red-parallax": "url('/public/RedBackground.png')",
        "yellow-parallax": "url('/public/AboutBackground.png')",
        "orange-parallax": "url('/public/OrangeBackground.png')",
      },
      zIndex: {
        "100": "100",
      },
    },
  },
  plugins: [],
};
export default config;
