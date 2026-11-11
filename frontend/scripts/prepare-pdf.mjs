import { mkdir, copyFile, cp } from "node:fs/promises";
const target = new URL("../public/pdf-assets/", import.meta.url);
await mkdir(target, { recursive: true });
await copyFile(
  new URL(
    "../node_modules/pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ),
  new URL("pdf.worker.min.mjs", target),
);
for (const folder of ["cmaps", "standard_fonts", "wasm"]) {
  await cp(
    new URL(`../node_modules/pdfjs-dist/${folder}/`, import.meta.url),
    new URL(`${folder}/`, target),
    { recursive: true },
  );
}
