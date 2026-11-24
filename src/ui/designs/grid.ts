/**
 * The wall's grid (web Wall.tsx `Grid` and `TileBase`): 12 columns on a wide
 * screen, 6 below 900 px, rows of 92 px with 8 px gaps, filled the way CSS
 * `grid-auto-flow: dense` fills them. Each kind of tile has its own shape; on
 * a phone (600 px and less) every tile is the width of the page, one under
 * the other (owner, 2026-11-17). Pure, so the shapes are tested.
 */
import type { TileKind } from "./gallery";

export const ROW = 92;
export const GAP = 8;

/** A tile's shape, or a placeholder's */
export type Shape = TileKind | "holder-big" | "holder-wide" | "holder";

export const columnsFor = (width: number) => (width >= 900 ? 12 : 6);

/** How many columns and rows a tile takes at this window width */
export function spanOf(
  shape: Shape,
  big: boolean,
  width: number,
): { cols: number; rows: number } {
  const columns = columnsFor(width);
  const phone = width <= 600;
  const wide = width >= 900;
  const span = (cols: number, rows: number) => ({
    cols: phone ? columns : Math.min(cols, columns),
    rows,
  });
  switch (shape) {
    case "paint":
      return { cols: columns, rows: 3 };
    case "mood":
      return span(6, 3);
    case "maker":
      return span(3, 2);
    case "look":
      return span(wide ? 3 : 6, 3);
    case "effect":
      return span(3, 4);
    case "card":
      return span(4, 6);
    case "frame":
      return big ? span(6, 4) : span(3, 2);
    case "plate":
      return span(wide ? 4 : 6, 2);
    case "type":
      return span(wide ? 4 : 6, 1);
    case "ink":
      return span(3, 1);
    case "holder-big":
      return span(6, 4);
    case "holder-wide":
      return span(6, 1);
    default:
      return span(3, 2);
  }
}

export type Placed = { x: number; y: number; width: number; height: number };

/**
 * Place tiles of the given spans on a grid `columns` wide, `dense`: each tile
 * goes into the first free spot from the top, so a small tile fills a hole
 * a large one left. Returns pixel boxes and the height of the whole grid.
 */
export function packGrid(
  spans: { cols: number; rows: number }[],
  columns: number,
  width: number,
  row = ROW,
  gap = GAP,
): { boxes: Placed[]; height: number } {
  const colWidth = (width - gap * (columns - 1)) / columns;
  const taken: boolean[][] = [];
  const free = (r: number, c: number, cols: number, rows: number) => {
    for (let y = r; y < r + rows; y++)
      for (let x = c; x < c + cols; x++) if (taken[y]?.[x]) return false;
    return true;
  };
  let bottom = 0;
  const boxes = spans.map(({ cols: wanted, rows }) => {
    const cols = Math.max(1, Math.min(wanted, columns));
    let r = 0;
    let c = 0;
    search: for (r = 0; ; r++) {
      for (c = 0; c + cols <= columns; c++)
        if (free(r, c, cols, rows)) break search;
    }
    for (let y = r; y < r + rows; y++) {
      taken[y] ??= [];
      for (let x = c; x < c + cols; x++) taken[y][x] = true;
    }
    bottom = Math.max(bottom, r + rows);
    return {
      x: c * (colWidth + gap),
      y: r * (row + gap),
      width: cols * colWidth + (cols - 1) * gap,
      height: rows * row + (rows - 1) * gap,
    };
  });
  return { boxes, height: bottom ? bottom * row + (bottom - 1) * gap : 0 };
}
