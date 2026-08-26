import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Pillars",
  description:
    "The pillars and values that guide the Theta Tau Delta Gamma chapter.",
  path: "/pillars",
});

export default function PillarsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
