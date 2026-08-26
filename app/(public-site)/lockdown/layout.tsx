import type { Metadata } from "next";

// An operational page rather than chapter content. It had no metadata at all,
// so it inherited the site-wide title and competed with the homepage for the
// same terms in search.
export const metadata: Metadata = {
  title: "Lockdown",
  description: "Chapter site status page.",
  robots: { index: false, follow: false },
};

export default function LockdownLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
