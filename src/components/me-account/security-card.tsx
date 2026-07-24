import { useState, type FormEvent } from "react";
import { KeyRound, Loader2, Lock, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { apiRaw, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { usePin, useSetPin } from "@/features/queries";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";

const PIN_LENGTH = 4;

export function SecurityCard() {
  return (
    <div className="space-y-6">
      <PinCard />
      <PasswordCard />
    </div>
  );
}

function PinCard() {
  const pinQuery = usePin();
  const setPin = useSetPin();
  const [value, setValue] = useState("");

  const isSet = Boolean(pinQuery.data?.pin);
  const valid = value.length === PIN_LENGTH;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setPin.mutate(value, {
      onSuccess: () => {
        toast.success(isSet ? "PIN updated" : "PIN set");
        setValue("");
      },
      onError: (err) =>
        toast.error(err instanceof ApiError ? err.message : "Couldn't save PIN"),
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary">
          <ShieldCheck className="size-4" />
        </span>
        <div>
          <CardTitle>Confirmation PIN</CardTitle>
          <CardDescription>
            A {PIN_LENGTH}-character PIN used to confirm flight reviews.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {pinQuery.isLoading ? (
          <Skeleton className="h-5 w-40" />
        ) : pinQuery.isError ? (
          <ErrorState error={pinQuery.error} onRetry={() => void pinQuery.refetch()} />
        ) : (
          <>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-muted-foreground">Current PIN</span>
              {isSet ? (
                <Badge variant="secondary" className="font-mono tracking-widest">
                  ••••
                </Badge>
              ) : (
                <span className="text-sm font-medium text-muted-foreground">
                  Not set
                </span>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-2">
              <Label htmlFor="pin">{isSet ? "Change PIN" : "Set PIN"}</Label>
              <div className="flex items-start gap-2">
                <div className="space-y-1">
                  <Input
                    id="pin"
                    value={value}
                    onChange={(e) => setValue(e.target.value.slice(0, PIN_LENGTH))}
                    inputMode="text"
                    maxLength={PIN_LENGTH}
                    autoComplete="off"
                    placeholder="1234"
                    aria-invalid={value.length > 0 && !valid}
                    className="w-28 font-mono tracking-[0.4em]"
                  />
                  {value.length > 0 && !valid && (
                    <p className="text-xs text-destructive">
                      PIN must be exactly {PIN_LENGTH} characters.
                    </p>
                  )}
                </div>
                <Button type="submit" disabled={!valid || setPin.isPending}>
                  {setPin.isPending && <Loader2 className="size-4 animate-spin" />}
                  {isSet ? "Update PIN" : "Set PIN"}
                </Button>
              </div>
            </form>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PasswordCard() {
  const { user } = useAuth();
  const [sending, setSending] = useState(false);

  async function sendReset() {
    if (!user?.email) return;
    setSending(true);
    try {
      await apiRaw("/auth/forgot-password", {
        method: "POST",
        body: { email: user.email },
      });
      toast.success("Check your email for a reset link.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't send reset email");
    } finally {
      setSending(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary">
          <Lock className="size-4" />
        </span>
        <div>
          <CardTitle>Password</CardTitle>
          <CardDescription>
            Reset your password with a secure link sent to your email.
          </CardDescription>
        </div>
      </CardHeader>
      <Separator />
      <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-5">
        <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
          <KeyRound className="size-4 shrink-0" />
          <span className="truncate">{user?.email ?? "—"}</span>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void sendReset()}
          disabled={sending || !user?.email}
        >
          {sending ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
          Send password reset email
        </Button>
      </CardContent>
    </Card>
  );
}
