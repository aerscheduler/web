/**
 * Messages (2026-10-16): the wire shapes of server/src/services/conversation.service.ts.
 *
 * A message body carries its mentions as tokens, `{p:12}` a person, `{r:3}` an aircraft,
 * `{v:88}` a booking, `{w:7}` a work order, `{s:9}` a squawk, and `refs` labels each one FOR
 * THIS READER. A `hidden` ref is something the reader may not open: draw its label, never a link.
 */

export type ConversationKind = "direct" | "group" | "reservation";

export type MessageRefType = "person" | "resource" | "reservation" | "workOrder" | "squawk";

export type MessageRef = { type: MessageRefType; id: number; label: string; hidden?: true };

export type ConversationPerson = {
  orgUserId: number;
  name: string;
  profileImage: string | null;
  roles: string[];
};

export type ConversationSummary = {
  id: number;
  kind: ConversationKind;
  /** Named for the reader: the other person, the group's name, or the booking. */
  title: string;
  groupTitle: string | null;
  lastMessageAt: string;
  reservation: {
    id: number;
    title: string;
    type: string;
    start: string;
    end: string;
    cancelledAt: string | null;
    resourceName: string | null;
  } | null;
  participants: ConversationPerson[];
  /** False for staff reading a booking's conversation they have not written in. */
  isParticipant: boolean;
  muted: boolean;
  lastReadMessageId: number | null;
  unreadCount: number;
  lastMessage: {
    id: number;
    createdAt: string;
    authorOrgUserId: number | null;
    authorName: string | null;
    preview: string;
  } | null;
};

export type ConversationMessage = {
  id: number;
  conversationId: number;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  authorKind: "member" | "system" | "agent";
  authorOrgUserId: number | null;
  body: string;
  action: unknown;
  clientId: string | null;
  refs: Record<string, MessageRef>;
  /** Photos and files on the message (2026-10-17). Absent from an older server. */
  attachments?: MessageAttachment[];
};

/** A photo or file on a message. `url` is a 15-minute signed link; `isImage` draws it inline. */
export type MessageAttachment = {
  id: number;
  fileName: string;
  contentType: string;
  isImage: boolean;
  url: string | null;
};

export type MessagesPage = {
  data: ConversationMessage[];
  authors: Record<string, ConversationPerson>;
  hasMore: boolean;
};

export type ConversationListPage = { data: ConversationSummary[]; nextCursor: string | null };
