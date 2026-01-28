// types/member.ts
export interface MemberDoc {
  clerkId?: string;
  discordId?: string;
  rollNo: string;
  fName: string;
  lName: string;
  majors: string[];
  minors?: string[];
  gradYear: number;
  bigs: any[];
  littles: any[];
  bio: string;
  headline?: string;
  pronouns?: string;
  skills?: string[];
  funFacts?: string[];
  projects?: Array<{
    title?: string;
    description?: string;
    link?: string;
  }>;
  work?: Array<{
    title?: string;
    organization?: string;
    start?: string;
    end?: string;
    description?: string;
    link?: string;
  }>;
  awards?: Array<{
    title?: string;
    issuer?: string;
    date?: string;
    description?: string;
  }>;
  customSections?: Array<{
    title?: string;
    body?: string;
  }>;
  committees: string[];
  familyLine: string;
  pledgeClass: string;
  isECouncil: boolean;
  ecouncilPosition: string;
  isCommitteeHead: boolean;
  hometown: string;
  socialLinks?: Record<string, string>;
  status: string;
  role: string;
  profilePicUrl?: string;
  resumeUrl?: string;
  isHidden?: boolean;
}
