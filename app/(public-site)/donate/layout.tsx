import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Donate",
  description:
    "Support scholarships, professional development, and service projects for the Theta Tau Delta Gamma chapter at ASU.",
  path: "/donate",
});

export default function DonateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
