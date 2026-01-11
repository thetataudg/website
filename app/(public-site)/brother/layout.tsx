import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Brother Form",
  description:
    "Submit or update brother information for the Theta Tau Delta Gamma chapter.",
};

export default function BrotherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
