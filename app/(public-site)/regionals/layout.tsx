import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Regionals",
  description:
    "Regional events and updates for Theta Tau Delta Gamma at ASU.",
  path: "/regionals",
});

export default function RegionalsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
