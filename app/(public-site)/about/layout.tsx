import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
  description:
    "Learn about the Delta Gamma chapter of Theta Tau at Arizona State University.",
};

export default function AboutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
