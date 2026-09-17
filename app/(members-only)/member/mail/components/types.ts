export type Folder = "inbox" | "starred" | "drafts" | "sent" | "archive" | "junk" | "trash" | "all";
/// What the middle column is showing: a folder, or `label:<id>`.
export type View = Folder | `label:${string}`;

export interface MailAccount {
  id: string;
  address: string;
  localPart: string;
  displayName: string;
  status: "pending" | "active" | "rejected" | "suspended" | "revoked";
  requestedAt?: string;
  reviewedAt?: string;
  reviewComments?: string;
}

export interface MailboxSummary {
  id: string;
  address: string;
  displayName: string;
  kind: "personal" | "role";
  committeeName: string | null;
  unread: number;
}

export interface AccountPayload {
  domain: string;
  eligible: boolean;
  member: { fName: string; lName: string };
  /// The member's personal mailbox or request, for onboarding.
  account: MailAccount | null;
  /// Every mailbox they can open, and the one Chapter Mail is showing.
  mailboxes?: MailboxSummary[];
  current?: MailAccount;
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
  replyToId?: string;
  forwardOfId?: string;
  includeQuote?: boolean;
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
  includeQuote?: boolean;
  forwardAttachments?: MailAttachment[];
  /// The message being replied to or forwarded. The server writes it under
  /// the member's text; the composer only previews it.
  quoted?: MailDetail;
  draftId?: string;
  attachments?: UploadedFile[];
}

export type LabelColor = "gray" | "red" | "orange" | "yellow" | "green" | "teal" | "blue" | "purple" | "pink";

export interface MailLabel {
  id: string;
  name: string;
  color: LabelColor;
  icon: string;
}

export interface FilterCriteria {
  from: string;
  to: string;
  subject: string;
  hasWords: string;
  doesNotHave: string;
  hasAttachment: boolean;
}

export interface FilterActions {
  skipInbox: boolean;
  markRead: boolean;
  star: boolean;
  labelId: string | null;
  trash: boolean;
}

export interface MailFilter {
  id: string;
  criteria: FilterCriteria;
  actions: FilterActions;
}

export interface MailSignature {
  id: string;
  name: string;
  html: string;
  includeSeparator: boolean;
}

export interface SignatureDefaults {
  newMail: string | null;
  reply: string | null;
}

/// A chapter member or committee behind an @mail address.
export interface MailPerson {
  kind: "member" | "committee";
  name: string;
  photoUrl: string | null;
  rollNo: string | null;
}

export type MailPeople = Record<string, MailPerson>;

export interface MailConversation {
  message: MailDetail;
  thread: MailDetail[];
  people: MailPeople;
}

export type AddressField = "from" | "to";

export type BulkMailAction =
  | "archive"
  | "junk"
  | "trash"
  | "inbox"
  | "read"
  | "unread"
  | "star"
  | "unstar"
  | "delete";

/// What can be done with an address from its menu.
export interface AddressActions {
  onCompose: (address: string) => void;
  onSearch: (address: string) => void;
  onFilter: (address: string, field: AddressField) => void;
  onBlock: (address: string) => void;
}
