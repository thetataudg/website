export const metadata = {
  title: "Member Portal",
  description:
    "Chapter tools for Theta Tau Delta Gamma members at Arizona State University.",
};

import "bootstrap/dist/css/bootstrap.min.css";
import "../(members-only)/members.css";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="members-shell" data-theme="light">
        {children}
      </body>
    </html>
  );
}
