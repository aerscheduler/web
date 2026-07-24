import { useMemo, useState, type FormEvent } from "react";
import { CalendarClock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { useMyAvailability, useUpdateAvailability } from "@/features/queries";
import type { AvailabilityInput } from "@/types/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ErrorState, TableSkeleton } from "@/components/states";
import { cn } from "@/lib/utils";

type DayKey = keyof AvailabilityInput;

const DAYS: { key: DayKey; label: string; short: string }[] = [
  { key: "monday", label: "Monday", short: "Mon" },
  { key: "tuesday", label: "Tuesday", short: "Tue" },
  { key: "wednesday", label: "Wednesday", short: "Wed" },
  { key: "thursday", label: "Thursday", short: "Thu" },
  { key: "friday", label: "Friday", short: "Fri" },
  { key: "saturday", label: "Saturday", short: "Sat" },
  { key: "sunday", label: "Sunday", short: "Sun" },
];

const DEFAULT_START = "09:00";
const DEFAULT_END = "17:00";

interface DayState {
  enabled: boolean;
  start: string;
  end: string;
}

type FormState = Record<DayKey, DayState>;

function seedFrom(data: AvailabilityInput | undefined): FormState {
  const out = {} as FormState;
  for (const { key } of DAYS) {
    const block = data?.[key]?.[0];
    out[key] = block
      ? { enabled: true, start: block.start, end: block.end }
      : { enabled: false, start: DEFAULT_START, end: DEFAULT_END };
  }
  return out;
}

export function AvailabilityEditor() {
  const query = useMyAvailability();
  const save = useUpdateAvailability();

  if (query.isLoading) {
    return (
      <Card>
        <TableSkeleton rows={7} cols={3} />
      </Card>
    );
  }
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }

  return <Editor initial={query.data} saving={save.isPending} onSave={save.mutate} />;
}

function Editor({
  initial,
  saving,
  onSave,
}: {
  initial: AvailabilityInput | undefined;
  saving: boolean;
  onSave: ReturnType<typeof useUpdateAvailability>["mutate"];
}) {
  const seed = useMemo(() => seedFrom(initial), [initial]);
  const [state, setState] = useState<FormState>(seed);

  function patchDay(key: DayKey, patch: Partial<DayState>) {
    setState((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  const invalid = DAYS.some(
    ({ key }) => state[key].enabled && state[key].start >= state[key].end
  );

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (invalid) return;
    // Send every day: enabled → one block, disabled → [] so cleared days persist.
    const input: AvailabilityInput = {};
    for (const { key } of DAYS) {
      const day = state[key];
      input[key] = day.enabled ? [{ start: day.start, end: day.end }] : [];
    }
    onSave(input, {
      onSuccess: () => toast.success("Availability saved"),
      onError: (err) =>
        toast.error(err instanceof ApiError ? err.message : "Couldn't save availability"),
    });
  }

  return (
    <Card>
      <form onSubmit={handleSubmit}>
        <CardHeader className="flex-row items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary">
            <CalendarClock className="size-4" />
          </span>
          <div>
            <CardTitle>Weekly availability</CardTitle>
            <CardDescription>Students book you against these hours.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          {DAYS.map(({ key, label, short }) => {
            const day = state[key];
            const badTime = day.enabled && day.start >= day.end;
            return (
              <div
                key={key}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5 first:pt-0 last:pb-0"
              >
                <div className="flex min-w-[8.5rem] items-center gap-3">
                  <Switch
                    checked={day.enabled}
                    onCheckedChange={(enabled) => patchDay(key, { enabled })}
                    aria-label={`Available on ${label}`}
                  />
                  <span
                    className={cn(
                      "text-sm font-medium",
                      !day.enabled && "text-muted-foreground"
                    )}
                  >
                    <span className="hidden sm:inline">{label}</span>
                    <span className="sm:hidden">{short}</span>
                  </span>
                </div>

                {day.enabled ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor={`start-${key}`} className="sr-only">
                        {label} start time
                      </Label>
                      <Input
                        id={`start-${key}`}
                        type="time"
                        value={day.start}
                        onChange={(e) => patchDay(key, { start: e.target.value })}
                        aria-invalid={badTime}
                        className="w-[7.5rem]"
                      />
                    </div>
                    <span className="text-sm text-muted-foreground">to</span>
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor={`end-${key}`} className="sr-only">
                        {label} end time
                      </Label>
                      <Input
                        id={`end-${key}`}
                        type="time"
                        value={day.end}
                        onChange={(e) => patchDay(key, { end: e.target.value })}
                        aria-invalid={badTime}
                        className="w-[7.5rem]"
                      />
                    </div>
                    {badTime && (
                      <span className="text-xs text-destructive">
                        End must be after start.
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">Unavailable</span>
                )}
              </div>
            );
          })}
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={saving || invalid}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Save availability
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
