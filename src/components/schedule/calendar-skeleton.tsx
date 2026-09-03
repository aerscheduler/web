import { Skeleton } from "@/components/ui/skeleton";
import type { ScheduleView } from "./schedule-controls";

export function ScheduleCalendarSkeleton({ view }: { view: ScheduleView }) {
  if (view === "month") {
    return (
      <div data-layout="calendar-skeleton" className="flex h-full min-h-[28rem] flex-col p-3">
        <div className="grid grid-cols-7 border-b border-border pb-2">
          {Array.from({ length: 7 }).map((_, index) => (
            <Skeleton key={index} className="mx-auto h-3 w-12" />
          ))}
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-5">
          {Array.from({ length: 35 }).map((_, index) => (
            <div key={index} className="border-b border-r border-border p-2">
              <Skeleton className="ml-auto size-5 rounded-full" />
              {index % 4 === 1 && <Skeleton className="mt-3 h-5 w-4/5 rounded-md" />}
              {index % 7 === 4 && <Skeleton className="mt-2 h-5 w-3/5 rounded-md" />}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const columns = view === "week" ? 7 : 5;
  return (
    <div data-layout="calendar-skeleton" className="flex h-full min-h-[28rem] flex-col p-3">
      <div
        className="grid border-b border-border pb-2 pl-16"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: columns }).map((_, index) => (
          <div key={index} className="border-l border-border px-2">
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
      <div className="relative min-h-0 flex-1">
        {Array.from({ length: 8 }).map((_, row) => (
          <div key={row} className="flex h-16 border-b border-border">
            <div className="w-16 shrink-0 pr-3 pt-2">
              <Skeleton className="ml-auto h-3 w-8" />
            </div>
            <div
              className="grid flex-1"
              style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: columns }).map((_, column) => (
                <div key={column} className="border-l border-border p-1.5">
                  {(row + column) % 9 === 2 && (
                    <Skeleton className="h-10 w-full rounded-md" />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
