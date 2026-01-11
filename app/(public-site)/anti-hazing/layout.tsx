import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Anti-Hazing",
  description:
    "Our commitment to a safe, respectful, and hazing-free experience at Theta Tau.",
};

export default function AntiHazingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
