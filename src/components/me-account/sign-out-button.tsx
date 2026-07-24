import { useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  function handleSignOut() {
    logout();
    void navigate({ to: "/login" });
  }

  return (
    <Button type="button" variant="outline" onClick={handleSignOut}>
      <LogOut className="size-4" />
      Sign out
    </Button>
  );
}
