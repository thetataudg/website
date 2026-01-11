import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Diversity, Equity, Inclusion",
  description:
    "Our DEI commitments for the Theta Tau Delta Gamma chapter at ASU.",
};

export default function DeiLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
