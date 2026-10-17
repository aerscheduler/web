import { describe, expect, it } from "vitest";
import { mergeIntoThread } from "@/features/messages";
import type { ConversationMessage, MessagesPage } from "@/types/messages";

const msg = (id: number, extra: Partial<ConversationMessage> = {}): ConversationMessage =>
  ({
    id,
    body: `m${id}`,
    refs: {},
    authorKind: "member",
    authorOrgUserId: 1,
    clientId: null,
    createdAt: new Date(2026, 9, 16, 12, 0, id).toISOString(),
    editedAt: null,
    deletedAt: null,
    ...extra,
  }) as ConversationMessage;

const thread = (...pages: ConversationMessage[][]) => ({
  pages: pages.map((data): MessagesPage => ({ data, authors: {}, hasMore: false })),
  pageParams: pages.map((_, i) => (i === 0 ? null : i)),
});

describe("mergeIntoThread", () => {
  it("appends new messages to the newest page in id order", () => {
    const before = thread([msg(1), msg(2)]);
    const after = mergeIntoThread(before, [msg(4), msg(3)]);
    expect(after!.pages[0]!.data.map((m) => m.id)).toEqual([1, 2, 3, 4]);
  });

  it("returns the very same object when nothing changed, so nothing re-renders", () => {
    const before = thread([msg(1), msg(2)]);
    expect(mergeIntoThread(before, [msg(1), msg(2)])).toBe(before);
  });

  it("replaces an edited or deleted message where it is, in any page, and leaves other pages alone", () => {
    const older = [msg(1), msg(2)];
    const before = thread([msg(3), msg(4)], older);
    const after = mergeIntoThread(before, [msg(2, { body: "fixed", editedAt: "2026-10-16T12:05:00Z" })])!;
    expect(after.pages[1]!.data[1]!.body).toBe("fixed");
    expect(after.pages[0]).toBe(before.pages[0]);
  });

  it("does nothing to a thread that has not loaded", () => {
    expect(mergeIntoThread(undefined, [msg(1)])).toBeUndefined();
  });
});
