import type { PDFDocumentProxy } from "pdfjs-dist";
export type Rect = [number, number, number, number];
export type PdfEdit = {
  id?: string;
  page: number;
  kind: "text" | "replace" | "highlight";
  rect: Rect;
  source_rect?: Rect;
  text: string;
  font_size: number;
  color: string;
  font_family?: "sans-serif" | "serif" | "monospace";
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: "left" | "center" | "right";
};
export type TextBlock = {
  id: string;
  text: string;
  rect: Rect;
  font_size: number;
  font_family: NonNullable<PdfEdit["font_family"]>;
  available_right?: number;
};
export async function textBlocks(
  document: PDFDocumentProxy,
  pageNumber: number,
): Promise<{ blocks: TextBlock[]; width: number; height: number }> {
  const { Util } = await import("pdfjs-dist");
  const page = await document.getPage(pageNumber + 1);
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const blocks: TextBlock[] = [];
  for (const [index, item] of content.items.entries()) {
    if (
      !("str" in item) ||
      !item.str.trim() ||
      !item.width ||
      blocks.length >= 2000
    )
      continue;
    const matrix = Util.transform(viewport.transform, item.transform);
    const height = Math.hypot(matrix[2], matrix[3]);
    const angle = Math.atan2(matrix[1], matrix[0]);
    const style = content.styles[item.fontName];
    const ascent = style?.ascent ?? 0.8;
    const descent = style?.descent ?? -0.2;
    const x = matrix[4],
      y = matrix[5];
    const ux = Math.cos(angle),
      uy = Math.sin(angle),
      vx = -uy,
      vy = ux;
    const corners = [ascent, descent].flatMap((a) =>
      [0, item.width].map((w) => [
        x + ux * w - vx * height * a,
        y + uy * w - vy * height * a,
      ]),
    );
    const clamp = (value: number) => Math.max(0, Math.min(1, value));
    const rect: Rect = [
      clamp((Math.min(...corners.map((c) => c[0])) - 0.5) / viewport.width),
      clamp((Math.min(...corners.map((c) => c[1])) - 0.5) / viewport.height),
      clamp((Math.max(...corners.map((c) => c[0])) + 0.5) / viewport.width),
      clamp((Math.max(...corners.map((c) => c[1])) + 0.5) / viewport.height),
    ];
    if (rect[2] <= rect[0] || rect[3] <= rect[1]) continue;
    const family = style?.fontFamily || "sans-serif";
    blocks.push({
      id: `source-${pageNumber}-${index}`,
      text: item.str,
      rect,
      font_size: Math.max(6, Math.min(72, Math.round(height * 10) / 10)),
      font_family: family.includes("mono")
        ? "monospace"
        : family.includes("sans")
          ? "sans-serif"
          : family.includes("serif")
            ? "serif"
            : "sans-serif",
    });
  }
  const positioned = blocks.map((block) => {
    const neighbors = blocks.filter(
      (other) =>
        other.id !== block.id &&
        other.rect[0] >= block.rect[2] &&
        Math.min(other.rect[3], block.rect[3]) >
          Math.max(other.rect[1], block.rect[1]),
    );
    return {
      ...block,
      available_right: neighbors.length
        ? Math.max(
            block.rect[2],
            Math.min(...neighbors.map((other) => other.rect[0])) - 0.005,
          )
        : Math.max(0.9, block.rect[2]),
    };
  });
  return { blocks: positioned, width: viewport.width, height: viewport.height };
}
