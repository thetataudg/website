import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Brothers",
  description:
    "Meet active members, alumni, and chapter officers of Theta Tau Delta Gamma.",
};

export default function BrothersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
