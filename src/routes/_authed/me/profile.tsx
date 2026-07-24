import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck, UserRound } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { ProfileCard } from "@/components/me-account/profile-card";
import { SecurityCard } from "@/components/me-account/security-card";
import { SignOutButton } from "@/components/me-account/sign-out-button";

export const Route = createFileRoute("/_authed/me/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Profile & account"
        subtitle="Manage your personal details and account security."
      />

      <Tabs defaultValue="profile" className="gap-4">
        <TabsList className="w-full justify-start sm:w-fit">
          <TabsTrigger value="profile" className="gap-1.5">
            <UserRound className="size-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-1.5">
            <ShieldCheck className="size-4" />
            Security
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <ProfileCard />
        </TabsContent>
        <TabsContent value="security">
          <SecurityCard />
        </TabsContent>
      </Tabs>

      <Separator className="my-5" />

      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">Sign out</p>
          <p className="text-xs text-muted-foreground">
            End your session on this device.
          </p>
        </div>
        <SignOutButton />
      </div>
    </div>
  );
}
