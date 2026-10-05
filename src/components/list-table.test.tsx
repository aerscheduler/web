// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ListTable, type ListTableColumn, type ListTableGroup } from "./list-table";

/**
 * The grouped list under the work order page and the job board. What these pin down is what a
 * desk relies on without thinking: totals land in the Total column, an item folds its lines, the
 * keyboard walks the rows in the order they read, and a click on a row's menu never opens the row.
 */

const COLUMNS: ListTableColumn[] = [
  { id: "qty", header: "Qty", width: "4rem", align: "end" },
  { id: "total", header: "Total", width: "6rem", align: "end", narrow: "keep" },
];

let width = 1000;
beforeEach(() => {
  width = 1000;
  // jsdom lays nothing out: the list measures itself to decide whether it is narrow.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({ width, height: 0, x: 0, y: 0, top: 0, left: 0, right: width, bottom: 0, toJSON: () => ({}) }) as DOMRect);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function groups(onOpen = vi.fn(), onMenu = vi.fn()): ListTableGroup[] {
  return [
    {
      id: "requested",
      label: "Requested by the owner",
      count: 1,
      summary: "$80.00",
      rows: [
        {
          id: "item-1",
          label: "Left mag drop",
          title: "Left mag drop",
          span: true,
          emphasis: true,
          cells: { total: "$80.00" },
          actions: (
            <button type="button" onClick={onMenu}>
              Item menu
            </button>
          ),
          children: [
            { id: "line-1", label: "Mag points", title: "Mag points", cells: { qty: "2", total: "$80.00" }, onOpen },
            { id: "line-2", label: "Gasket", title: "Gasket", cells: { qty: "1", total: "$0.00" } },
          ],
        },
      ],
    },
    { id: "found", label: "Found by the shop", count: 0, rows: [] },
    { id: "loose", label: "Not for a specific item", count: 1, summary: "$15.00", rows: [{ id: "line-3", label: "Ferry fee", title: "Ferry fee", cells: { qty: "1", total: "$15.00" } }] },
  ];
}

describe("ListTable", () => {
  it("draws only groups with rows, each with its count and its total in the last column", () => {
    render(<ListTable label="Work" columns={COLUMNS} groups={groups()} showHeader titleHeader="Item" />);
    expect(screen.queryByText("Found by the shop")).toBeNull();
    const group = screen.getByRole("row", { name: /Requested by the owner/ });
    expect(group?.textContent).toContain("$80.00");
    expect(screen.getByRole("columnheader", { name: "Total" })).toBeTruthy();
    expect(screen.getByRole("row", { name: "Mag points" }).getAttribute("aria-level")).toBe("3");
  });

  it("folds an item's lines and a whole group", () => {
    render(<ListTable label="Work" columns={COLUMNS} groups={groups()} />);
    const item = screen.getByRole("row", { name: "Left mag drop" });
    expect(item.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(within(item).getByRole("button", { name: "Hide its lines" }));
    expect(screen.queryByRole("row", { name: "Mag points" })).toBeNull();
    expect(item.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(screen.getByRole("row", { name: /Not for a specific item/ }));
    expect(screen.queryByRole("row", { name: "Ferry fee" })).toBeNull();
  });

  it("walks the rows by keyboard: down, up to the parent, fold and open, Enter opens a line", () => {
    const onOpen = vi.fn();
    render(<ListTable label="Work" columns={COLUMNS} groups={groups(onOpen)} />);
    const item = screen.getByRole("row", { name: "Left mag drop" });
    // One row takes the tab stop; the rest are reached with the arrows.
    expect(item.tabIndex).toBe(0);
    item.focus();
    fireEvent.keyDown(item, { key: "ArrowDown" });
    const line = screen.getByRole("row", { name: "Mag points" });
    expect(document.activeElement).toBe(line);
    fireEvent.keyDown(line, { key: "Enter" });
    expect(onOpen).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(line, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(item);
    fireEvent.keyDown(item, { key: "ArrowLeft" });
    expect(screen.queryByRole("row", { name: "Mag points" })).toBeNull();
    fireEvent.keyDown(item, { key: "ArrowRight" });
    expect(screen.getByRole("row", { name: "Mag points" })).toBeTruthy();
    fireEvent.keyDown(item, { key: "End" });
    expect(document.activeElement).toBe(screen.getByRole("row", { name: "Ferry fee" }));
  });

  it("never opens or folds a row when its menu is clicked", () => {
    const onMenu = vi.fn();
    render(<ListTable label="Work" columns={COLUMNS} groups={groups(vi.fn(), onMenu)} />);
    fireEvent.click(screen.getByRole("button", { name: "Item menu" }));
    expect(onMenu).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("row", { name: "Left mag drop" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("folds the narrow columns under the title when the list itself is narrow, keeping the total", () => {
    width = 400;
    render(<ListTable label="Work" columns={COLUMNS} groups={groups()} showHeader titleHeader="Item" />);
    expect(screen.queryByRole("columnheader", { name: "Qty" })).toBeNull();
    const line = screen.getByRole("row", { name: "Mag points" });
    expect(line.querySelector('[data-col="qty"]')).toBeNull();
    expect(line.querySelector('[data-col="total"]')?.textContent).toContain("$80.00");
    expect(line?.textContent).toContain("2");
  });

  it("says so when there is nothing to list", () => {
    render(<ListTable label="Work" columns={COLUMNS} groups={[{ id: "a", label: "A", rows: [] }]} empty={<p>Nothing yet</p>} footer={{ label: "Total", value: "$0.00" }} />);
    expect(screen.getByText("Nothing yet")).toBeTruthy();
    expect(screen.queryByText("$0.00")).toBeNull();
  });
});

describe("ListTable rows that start folded", () => {
  const tail = (defaultFolded: boolean): ListTableGroup[] => [
    {
      id: "g",
      label: "Fleet",
      rows: [
        {
          id: "tail-1",
          label: "N12345",
          title: "N12345",
          defaultFolded,
          children: [{ id: "rem-1", label: "Annual", title: "Annual" }],
        },
      ],
    },
  ];

  it("hides its children until unfolded", () => {
    render(<ListTable label="Fleet" columns={COLUMNS} groups={tail(true)} />);
    expect(screen.queryByText("Annual")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show its lines" }));
    expect(screen.getByText("Annual")).toBeTruthy();
  });

  it("keeps a row open by hand when its default turns to folded", () => {
    // A tail that needed attention (open by default), and the list re-renders with it current.
    const { rerender } = render(<ListTable label="Fleet" columns={COLUMNS} groups={tail(false)} />);
    fireEvent.click(screen.getByRole("button", { name: "Hide its lines" }));
    fireEvent.click(screen.getByRole("button", { name: "Show its lines" }));
    rerender(<ListTable label="Fleet" columns={COLUMNS} groups={tail(true)} />);
    expect(screen.getByText("Annual")).toBeTruthy();
  });

  it("opens with its default when nobody touched it, whichever way the default moves", () => {
    const { rerender } = render(<ListTable label="Fleet" columns={COLUMNS} groups={tail(true)} />);
    expect(screen.queryByText("Annual")).toBeNull();
    rerender(<ListTable label="Fleet" columns={COLUMNS} groups={tail(false)} />);
    expect(screen.getByText("Annual")).toBeTruthy();
  });
});

describe("ListTable and portals", () => {
  it("does not fold a row when a click lands in a dialog opened from it", async () => {
    const { createPortal } = await import("react-dom");
    const Dialog = () => createPortal(<p>Inside the dialog</p>, document.body);
    render(
      <ListTable
        label="Lessons"
        columns={COLUMNS}
        groups={[
          {
            id: "g",
            label: "Stage 1",
            rows: [
              {
                id: "lesson-1",
                label: "Pattern work",
                title: "Pattern work",
                cells: { qty: <Dialog /> },
                children: [{ id: "rec-1", label: "Signed", title: "Signed record" }],
              },
            ],
          },
        ]}
      />
    );
    expect(screen.getByText("Signed record")).toBeTruthy();
    fireEvent.click(screen.getByText("Inside the dialog"));
    expect(screen.getByText("Signed record")).toBeTruthy();
  });

  it("nests subgroups under their group, folds them with it, and walks their rows", () => {
    const nested: ListTableGroup[] = [
      {
        id: "today",
        label: "Today",
        count: 3,
        rows: [],
        subgroups: [
          { id: "today/a", label: "N123AB", count: 2, rows: [{ id: "r1", label: "First", title: "First" }, { id: "r2", label: "Second", title: "Second" }] },
          { id: "today/empty", label: "Empty one", count: 0, rows: [] },
          { id: "today/b", label: "N456CD", count: 1, rows: [{ id: "r3", label: "Third", title: "Third" }] },
        ],
      },
      { id: "empty", label: "No rows anywhere", rows: [], subgroups: [{ id: "empty/x", label: "Nothing", rows: [] }] },
    ];
    render(<ListTable label="Nested" columns={COLUMNS} groups={nested} />);
    expect(screen.getByText("N123AB")).toBeTruthy();
    expect(screen.queryByText("Empty one")).toBeNull();
    expect(screen.queryByText("No rows anywhere")).toBeNull();
    // The first row in reading order is the tab stop, though the group itself holds no rows.
    const first = screen.getByRole("row", { name: "First" });
    expect(first.tabIndex).toBe(0);
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowDown" });
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByRole("row", { name: "Third" }));
    // Folding the outer group hides every subgroup with it.
    fireEvent.click(screen.getByText("Today"));
    expect(screen.queryByText("N123AB")).toBeNull();
    expect(screen.queryByRole("row", { name: "Third" })).toBeNull();
  });
});
