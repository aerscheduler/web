import { useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ChevronDown, ChevronsUpDown, ChevronUp } from "lucide-react";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

function sortIcon(dir: false | "asc" | "desc") {
  if (dir === "asc") return <ChevronUp className="size-3.5" />;
  if (dir === "desc") return <ChevronDown className="size-3.5" />;
  return <ChevronsUpDown className="size-3.5 opacity-40" />;
}

export function DataTable<T>({
  columns,
  data,
}: {
  columns: ColumnDef<T, unknown>[];
  data: T[];
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <Table>
      <THead>
        {table.getHeaderGroups().map((hg) => (
          <TR key={hg.id} className="hover:bg-transparent">
            {hg.headers.map((h) => (
              <TH key={h.id}>
                {h.isPlaceholder ? null : h.column.getCanSort() ? (
                  <button
                    type="button"
                    onClick={h.column.getToggleSortingHandler()}
                    className="inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-foreground"
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {sortIcon(h.column.getIsSorted())}
                  </button>
                ) : (
                  flexRender(h.column.columnDef.header, h.getContext())
                )}
              </TH>
            ))}
          </TR>
        ))}
      </THead>
      <TBody>
        {table.getRowModel().rows.map((row) => (
          <TR key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <TD key={cell.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </TD>
            ))}
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
