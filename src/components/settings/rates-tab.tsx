import { useState, type FormEvent } from "react";
import { GraduationCap, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { pageRows, useCreateRating, useRatingsPage } from "@/features/queries";
import { TablePagination } from "@/components/table-pagination";
import { usePaging } from "@/lib/paging";
import type { OrganizationRating } from "@/types/api";
import { ApiError } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/states";
import { ResponsiveModal } from "@/components/responsive-modal";
import { MoneyInput } from "@/components/money-input";
import { Field } from "@/components/settings/parts";
import { formatMoney } from "@/lib/utils";

export function RatesTab() {
  const paging = usePaging();
  const q = useRatingsPage(paging);
  const [open, setOpen] = useState(false);
  const { rows: ratings, total } = pageRows(q);

  return (
    <Card data-doc-shot="instruction-rates-tab">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary">
            <GraduationCap className="size-4" />
          </span>
          <div>
            <CardTitle>Instruction rates</CardTitle>
            <CardDescription>
              Ratings and their default hourly instructor rate.
            </CardDescription>
          </div>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="size-4" /> Add rating
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {q.isPending ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-5 w-20" />
              </div>
            ))}
          </div>
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : total === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="No ratings yet"
            body="Add ratings like Private, Instrument, or Commercial to set default instructor rates."
            action={
              <Button size="sm" onClick={() => setOpen(true)}>
                <Plus className="size-4" /> Add rating
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {ratings.map((r) => (
              <RatingRow key={r.id} rating={r} />
            ))}
          </ul>
        )}
        <TablePagination
          paging={paging}
          total={total}
          returned={ratings.length}
          loading={q.isFetching}
          className="px-1"
        />
      </CardContent>

      <AddRatingModal open={open} onOpenChange={setOpen} />
    </Card>
  );
}

function RatingRow({ rating }: { rating: OrganizationRating }) {
  return (
    <li className="flex items-center justify-between gap-4 px-4 py-2.5">
      <span className="min-w-0 truncate text-sm font-medium">{rating.name}</span>
      <span className="shrink-0 text-sm font-medium tnum">
        {formatMoney(rating.defaultInstructorRate)}
        <span className="ml-0.5 text-xs font-normal text-muted-foreground">/hr</span>
      </span>
    </li>
  );
}

function AddRatingModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateRating();
  const [name, setName] = useState("");
  const [rateCents, setRateCents] = useState(0);
  const [errors, setErrors] = useState<{ name?: string }>({});

  function reset() {
    setName("");
    setRateCents(0);
    setErrors({});
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (create.isPending) return;
    // Tell the user what's missing instead of silently disabling the button.
    if (name.trim().length === 0) {
      setErrors({ name: "Name is required" });
      document.getElementById("rating-name")?.focus();
      return;
    }
    create.mutate(
      { name: name.trim(), defaultInstructorRate: rateCents },
      {
        onSuccess: () => {
          toast.success("Rating added");
          reset();
          onOpenChange(false);
        },
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : "Couldn't add rating"),
      }
    );
  }

  return (
    <ResponsiveModal
      footer={
        <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit"
                form="modal-rates-tab" disabled={create.isPending}>
              {create.isPending && <Loader2 className="size-4 animate-spin" />}
              Add rating
            </Button>
        </div>
      }
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
      title="Add rating"
      description="Create an instruction type and its default hourly rate."
    >
      <form id="modal-rates-tab" onSubmit={handleSubmit} className="space-y-5">
        <Field label="Name" htmlFor="rating-name">
          <Input
            id="rating-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (errors.name) setErrors({});
            }}
            placeholder="Private Pilot"
            autoFocus
            aria-invalid={!!errors.name}
          />
          {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
        </Field>
        <Field
          label="Default instructor rate"
          htmlFor="rating-rate"
          hint="Charged per hour of instruction for this rating."
        >
          <MoneyInput id="rating-rate" cents={rateCents} onCentsChange={setRateCents} />
        </Field>
      </form>
    </ResponsiveModal>
  );
}
