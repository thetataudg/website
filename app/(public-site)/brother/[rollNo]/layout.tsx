import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: { rollNo: string };
}): Promise<Metadata> {
  try {
    // Construct base URL for API calls
    const isDev = process.env.NODE_ENV === "development";
    const baseUrl = isDev 
      ? "http://localhost:3000" 
      : (process.env.NEXT_PUBLIC_BASE_URL || "https://thetatauasu.org");
    
    const res = await fetch(`${baseUrl}/api/members/${params.rollNo}`, {
      cache: "no-store",
    });
    
    if (!res.ok) {
      throw new Error("Member not found");
    }
    
    const member = await res.json();
    const fullName = `${member.fName} ${member.lName}`;
    
    return {
      title: `${fullName} | ASU Theta Tau, Delta Gamma Chapter`,
      description: `View ${fullName}'s profile for the Theta Tau Delta Gamma chapter at ASU. ${member.headline || member.majors?.join(", ") || "Engineering student"}`,
    };
  } catch (error) {
    // Fallback metadata if fetch fails
    return {
      title: "Brother Profile | ASU Theta Tau, Delta Gamma Chapter",
      description:
        "View a brother profile for the Theta Tau Delta Gamma chapter at ASU.",
    };
  }
}

export default function BrotherProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
