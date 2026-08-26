import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Diversity, Equity, Inclusion",
  description:
    "Our DEI commitments for the Theta Tau Delta Gamma chapter at ASU.",
  path: "/dei",
});

export default function DeiLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
