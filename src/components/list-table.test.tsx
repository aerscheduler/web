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
