import { createFileRoute } from "@tanstack/react-router";
import { OpenMessages } from "@/components/messages/open-messages";

/**
 * Where a push or an email about a message lands: `linksFor({ kind: "conversation" })` on the
 * server builds `/messages/:id`. Not a page: it opens that conversation in Messages, expanded.
 */
export const Route = createFileRoute("/_authed/messages_/$conversationId")({
  component: OpenConversation,
});

function OpenConversation() {
  const { conversationId } = Route.useParams();
  const id = Number(conversationId);
  return <OpenMessages conversationId={Number.isInteger(id) && id > 0 ? id : null} />;
}
