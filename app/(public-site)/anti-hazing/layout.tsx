import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Anti-Hazing",
  description:
    "Our commitment to a safe, respectful, and hazing-free experience at Theta Tau.",
  path: "/anti-hazing",
});

export default function AntiHazingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
