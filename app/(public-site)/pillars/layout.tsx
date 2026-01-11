import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pillars",
  description:
    "The pillars and values that guide the Theta Tau Delta Gamma chapter.",
};

export default function PillarsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
