import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Brothers",
  description:
    "Meet active members, alumni, and chapter officers of Theta Tau Delta Gamma.",
  path: "/brothers",
  hasChildRoutes: true,
});

export default function BrothersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
