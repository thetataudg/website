export type Folder = "inbox" | "starred" | "drafts" | "sent" | "archive" | "junk" | "trash";

export interface MailAccount {
  id: string;
  address: string;
  localPart: string;
  displayName: string;
  status: "pending" | "active" | "rejected" | "suspended";
  requestedAt?: string;
  reviewedAt?: string;
  reviewComments?: string;
}

export interface AccountPayload {
  domain: string;
  eligible: boolean;
  member: { fName: string; lName: string };
  account: MailAccount | null;
  suggestions?: string[];
  unread?: number;
  budget?: { count: number; budget: number };
}

export interface MailListItem {
  id: string;
  threadId: string;
  folder: Folder;
  direction: "in" | "out";
  from: string;
  fromName: string;
  to: string[];
  subject: string;
  snippet: string;
  read: boolean;
  starred: boolean;
  labels: string[];
  hasAttachments: boolean;
  deliveryStatus: string;
  date: string;
}

export interface MailAttachment {
  index: number;
  filename: string;
  contentType: string;
  size: number;
  inline: boolean;
  contentId?: string;
  state: "pending" | "ready" | "failed";
  url: string;
  key?: string;
}

export interface MailDetail extends MailListItem {
  cc: string[];
  bcc: string[];
  replyTo: string[];
  messageId: string;
  references: string[];
  text: string;
  html: string;
  attachments: MailAttachment[];
  inlineImageUrls?: string[];
}

export type FolderCounts = Record<string, { total: number; unread: number }>;

export interface UploadedFile {
  key: string;
  filename: string;
  contentType: string;
  size: number;
}

export interface ComposeSeed {
  mode: "new" | "reply" | "replyAll" | "forward" | "draft";
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  text?: string;
  html?: string;
  replyToId?: string;
  forwardOfId?: string;
  forwardAttachments?: MailAttachment[];
  draftId?: string;
  attachments?: UploadedFile[];
}
