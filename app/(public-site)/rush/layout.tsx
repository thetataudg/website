import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Rush",
  description:
    "Rush events and recruitment details for Theta Tau Delta Gamma.",
};

export default function RushLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
