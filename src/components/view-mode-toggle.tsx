import { LayoutGrid, List } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type ViewMode = "grid" | "list";

/** Icon toggle matching Aircraft — grid cards vs dense list. */
export function ViewModeToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as ViewMode)}>
      <TabsList>
        <TabsTrigger value="grid" aria-label="Grid view">
          <LayoutGrid className="size-4" />
        </TabsTrigger>
        <TabsTrigger value="list" aria-label="List view">
          <List className="size-4" />
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
