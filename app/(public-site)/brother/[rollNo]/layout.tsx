import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Brother Profile",
  description:
    "View a brother profile for the Theta Tau Delta Gamma chapter at ASU.",
};

export default function BrotherProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
