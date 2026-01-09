// types/member.ts
export interface MemberDoc {
  clerkId: string;
  rollNo: string;
  fName: string;
  lName: string;
  majors: string[];
  gradYear: number;
  bigs: any[];
  littles: any[];
  bio: string;
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
}
