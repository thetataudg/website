import { Bungee, Inter, Poppins } from "next/font/google";

export const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const poppins = Poppins({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-poppins",
  weight: "300",
});

export const bungee = Bungee({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-bungee",
  weight: "400",
});
