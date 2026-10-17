import * as React from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useMessagesDock } from "@/components/messages/messages-dock";

/**
 * The /messages links (push, email, ⌘K) as a redirect: open Messages expanded on the
 * conversation, then step off the URL, back to the page you were on, or Home when the link
 * was opened cold. Renders nothing.
 */
export function OpenMessages({ conversationId }: { conversationId: number | null }) {
  const { openMessages } = useMessagesDock();
  const router = useRouter();
  const navigate = useNavigate();
  const done = React.useRef(false);

  React.useEffect(() => {
    if (done.current) return;
    done.current = true;
    openMessages(conversationId, { expanded: true });
    if (router.history.canGoBack()) router.history.back();
    else void navigate({ to: "/me", replace: true });
  }, [conversationId, openMessages, router, navigate]);

  return null;
}
