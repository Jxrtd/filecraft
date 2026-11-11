export function downloadName(original: string, extension: string): string {
  const basename = original.replaceAll("\\", "/").split("/").pop() || "";
  const dot = basename.lastIndexOf(".");
  const stem = dot >= 0 ? basename.slice(0, dot) : basename;
  const cleaned = Array.from(stem)
    .map((character) =>
      /[<>:"/\\|?*]/.test(character) ||
      character.charCodeAt(0) < 32 ||
      character.charCodeAt(0) === 127
        ? "_"
        : character,
    )
    .join("")
    .replace(/^[ .]+|[ .]+$/g, "");
  const safeStem = Array.from(cleaned)
    .slice(0, 180)
    .join("")
    .replace(/[ .]+$/g, "");
  return `${safeStem || "filecraft"}.${extension}`;
}
