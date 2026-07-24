import { useState, type FormEvent } from "react";
import { Loader2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useUpdateProfile } from "@/features/queries";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RoleBadges } from "@/components/role-badges";
import { initials } from "@/lib/utils";

export function ProfileCard() {
  const { user, roles, rehydrate } = useAuth();
  const update = useUpdateProfile();

  const initialName = user?.name ?? "";
  const [name, setName] = useState(initialName);

  const trimmed = name.trim();
  const valid = trimmed.length > 0;
  const dirty = trimmed !== initialName;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!dirty || !valid) return;
    update.mutate(
      { name: trimmed },
      {
        onSuccess: async () => {
          toast.success("Profile updated");
          await rehydrate();
        },
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : "Couldn't save changes"),
      }
    );
  }

  return (
    <Card>
      <form onSubmit={handleSubmit}>
        <CardHeader className="flex-row items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary">
            <UserRound className="size-4" />
          </span>
          <div>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Your name and account details.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar className="size-14">
              {user?.publicProfileImage && (
                <AvatarImage src={user.publicProfileImage} alt={user.name ?? "You"} />
              )}
              <AvatarFallback className="text-base">
                {initials(user?.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{user?.name ?? "—"}</div>
              <div className="truncate text-xs text-muted-foreground">
                {user?.email ?? ""}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-name">Name</Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              autoComplete="name"
              aria-invalid={!valid}
            />
            {!valid && <p className="text-xs text-destructive">Name is required.</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-email">Email</Label>
            <Input
              id="profile-email"
              type="email"
              value={user?.email ?? ""}
              readOnly
              disabled
              className="text-muted-foreground"
            />
            <p className="text-xs text-muted-foreground">Your sign-in email can't be changed here.</p>
          </div>

          <div className="space-y-2">
            <Label>Your roles</Label>
            <RoleBadges roles={roles} />
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={!dirty || !valid || update.isPending}>
            {update.isPending && <Loader2 className="size-4 animate-spin" />}
            Save changes
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
