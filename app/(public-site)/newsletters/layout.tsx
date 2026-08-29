import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Newsletters",
  description:
    "Chapter newsletters from Theta Tau Delta Gamma at Arizona State University: rush, service, professional development, and what the chapter has been up to.",
  path: "/newsletters",
  // The article routes sit beneath this one, and Next applies only the
  // *nearest* ancestor title template. Without this, every issue would render
  // as a bare headline with the site name stripped off it.
  hasChildRoutes: true,
});

export default function NewslettersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
