import { createFileRoute } from "@tanstack/react-router";
import { OpenMessages } from "@/components/messages/open-messages";

// Not a page: /messages opens the Messages modal over the page you came from (or Home, when
// the link was opened cold). Every member, outside aircraft owners included: the server scopes
// every read to the conversations the caller is in (server/src/services/conversation.service.ts).
export const Route = createFileRoute("/_authed/messages")({
  component: () => <OpenMessages conversationId={null} />,
});
