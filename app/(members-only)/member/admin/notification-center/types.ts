import type { AudienceMember } from "@/lib/notify/broadcastAudience";

export interface RosterMember extends AudienceMember {
  rollNo: string;
  name: string;
  gradYear: number | null;
  ecouncilPosition: string;
  hasAccount: boolean;
  hasDevice: boolean;
  hasEmail: boolean;
}

export interface RosterCommittee {
  _id: string;
  name: string;
  color: string | null;
}

export interface Roster {
  members: RosterMember[];
  committees: RosterCommittee[];
  me: string;
  configured: Record<string, boolean>;
}

export interface DeliveryAttempt {
  channel: string;
  delivered: boolean;
  reason?: string;
}

export interface BroadcastSummary {
  id: string;
  title: string;
  body: string;
  link: string;
  imageUrl: string;
  channels: string[];
  audienceLabel: string;
  isTest: boolean;
  status: "sending" | "sent" | "partial" | "failed" | "interrupted";
  recipientCount: number;
  reachedCount: number;
  channelCounts: Record<string, number>;
  sentByName: string;
  createdAt: string;
  completedAt: string | null;
  recipients?: Array<{
    memberId: string;
    name: string;
    rollNo: string;
    status: string;
    attempts: DeliveryAttempt[];
  }>;
}

export const CHANNEL_LABELS: Record<string, string> = {
  push: "Push",
  inapp: "In-app",
  email: "Email",
};
