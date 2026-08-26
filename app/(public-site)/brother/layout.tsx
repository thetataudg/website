import type { Metadata } from "next";

export const metadata: Metadata = {
  // The object form keeps the root layout's "%s | ..." template flowing down to
  // /brother/[rollNo]; a plain-string title here would stop it, and every
  // profile tab would read as a bare first and last name.
  title: {
    default: "Brother Form",
    template: "%s | ASU Theta Tau - Delta Gamma Chapter",
  },
  description:
    "Submit or update brother information for the Theta Tau Delta Gamma chapter.",
  // An internal submission form, not a page the chapter wants in search
  // results. app/robots.ts disallows /brother as well.
  robots: { index: false, follow: false },
};

export default function BrotherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
