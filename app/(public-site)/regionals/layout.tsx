import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Regionals",
  description:
    "Regional events and updates for Theta Tau Delta Gamma at ASU.",
};

export default function RegionalsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
