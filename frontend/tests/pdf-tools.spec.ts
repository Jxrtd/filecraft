import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

function pdf(labels: string[]) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${labels.map((_, i) => `${4 + i * 2} 0 R`).join(" ")}] /Count ${labels.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  for (const label of labels) {
    const content = `BT /F1 16 Tf 72 720 Td (${label}) Tj ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${objects.length + 2} 0 R >>`,
      `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    );
  }
  let output = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(output);
  output +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
      .join("") +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output);
}

test("edit PDF text directly, remove a page, and retain the filename", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/pdf-editor");
  await expect(
    page.getByRole("button", { name: "Browse Files", exact: true }),
  ).toBeEnabled();
  await page.getByLabel("Upload a PDF to edit").setInputFiles({
    name: "Report.final.pdf",
    mimeType: "application/pdf",
    buffer: pdf(["OLD LABEL", "SECOND PAGE"]),
  });
  await expect(page.locator(".doc-paper canvas")).toBeVisible();
  await expect(page.getByText("Rendering page…")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Edit text: OLD LABEL", exact: true })
    .click();
  await page
    .getByLabel("Edit text on page", { exact: true })
    .fill("REVISED LABEL");
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Bold", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Delete original page 2", exact: true })
    .click();
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/api/pdf-edit") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Save edited PDF", exact: true })
    .click();
  expect((await response).status()).toBe(200);
  await expect(page.locator(".pdf-result-view canvas")).toBeVisible();
  await expect(page.locator(".pdf-result-view .pdf-render-status")).toHaveCount(
    0,
  );
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download PDF", exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("Report.final.pdf");
  expect(
    (await readFile((await download.path())!)).subarray(0, 5).toString(),
  ).toBe("%PDF-");
  expect(errors).toEqual([]);
});

test("combine PDFs in reordered file order", async ({ page }) => {
  await page.goto("/merge-pdf");
  await expect(
    page.getByRole("button", { name: "Browse Files", exact: true }),
  ).toBeEnabled();
  await page.getByLabel("Upload PDFs to combine").setInputFiles([
    { name: "First.pdf", mimeType: "application/pdf", buffer: pdf(["FIRST"]) },
    {
      name: "Second.pdf",
      mimeType: "application/pdf",
      buffer: pdf(["SECOND"]),
    },
  ]);
  await expect(
    page.getByRole("button", { name: "Combine PDFs", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Move First.pdf down", exact: true })
    .click();
  const responseEvent = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/pdf-merge") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Combine PDFs", exact: true }).click();
  const response = await responseEvent;
  expect(response.status()).toBe(200);
  await expect(page.locator(".file-info strong").first()).toHaveText(
    "1. Second.pdf",
  );
  await expect(page.locator(".pdf-result-view canvas")).toBeVisible();
  await expect(page.locator(".pdf-result-view .pdf-render-status")).toHaveCount(
    0,
  );
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download PDF", exact: true }).click();
  expect((await downloadEvent).suggestedFilename()).toBe("Second.pdf");
});

test("mobile editor supports pointer selection and keyboard controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/pdf-editor");
  await expect(
    page.getByRole("button", { name: "Browse Files", exact: true }),
  ).toBeEnabled();
  await page.getByLabel("Upload a PDF to edit").setInputFiles({
    name: "Mobile.pdf",
    mimeType: "application/pdf",
    buffer: pdf(["MOBILE PDF"]),
  });
  await expect(page.getByText("Rendering page…")).toHaveCount(0);
  await page.getByRole("button", { name: "Add text", exact: true }).click();
  await page
    .getByLabel("Edit text on page", { exact: true })
    .fill("Added on mobile");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Edit changed text: Added on mobile",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Highlight", exact: true }).click();
  const surface = page.locator(".doc-paper");
  await surface.scrollIntoViewIfNeeded();
  const bounds = (await surface.boundingBox())!;
  await page.mouse.move(
    bounds.x + bounds.width * 0.1,
    bounds.y + bounds.height * 0.4,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width * 0.8,
    bounds.y + bounds.height * 0.5,
  );
  await page.mouse.up();
  await expect(page.locator(".doc-highlight")).toHaveCount(1);
  const responseEvent = page.waitForResponse((r) =>
    r.url().endsWith("/api/pdf-edit"),
  );
  await page
    .getByRole("button", { name: "Save edited PDF", exact: true })
    .click();
  expect((await responseEvent).status()).toBe(200);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(page.locator(".pdf-result-view canvas")).toBeVisible();
  await expect(page.locator(".pdf-result-view .pdf-render-status")).toHaveCount(
    0,
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "../.runtime/pdf-editor-mobile.png",
    fullPage: true,
  });
});

test("document editor undo, redo, font controls and keyboard save", async ({
  page,
}) => {
  await page.goto("/pdf-editor");
  await expect(
    page.getByRole("button", { name: "Browse Files", exact: true }),
  ).toBeEnabled();
  await page.getByLabel("Upload a PDF to edit").setInputFiles({
    name: "Formatting.pdf",
    mimeType: "application/pdf",
    buffer: pdf(["EDIT THIS LINE"]),
  });
  await page
    .getByRole("button", { name: "Edit text: EDIT THIS LINE", exact: true })
    .click();
  await page
    .getByLabel("Edit text on page", { exact: true })
    .fill("New document wording");
  await page.getByLabel("Font family", { exact: true }).selectOption("serif");
  await page.getByLabel("Font size", { exact: true }).selectOption("18");
  await page.getByRole("button", { name: "Italic", exact: true }).click();
  await page.getByRole("button", { name: "Underline", exact: true }).click();
  await page.getByRole("button", { name: "Align center", exact: true }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Edit changed text: New document wording",
      exact: true,
    }),
  ).toHaveCSS("font-style", "italic");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Edit changed text: New document wording",
      exact: true,
    })
    .click();
  const responseEvent = page.waitForResponse(
    (r) => r.url().endsWith("/api/pdf-edit") && r.request().method() === "POST",
  );
  await page.keyboard.press("Control+s");
  expect((await responseEvent).status()).toBe(200);
  await expect(page.locator(".pdf-result-view canvas")).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "../.runtime/pdf-docs-editor-desktop.png",
    fullPage: true,
  });
});

test("opening text keeps it unchanged, while clearing a block deletes it", async ({
  page,
}) => {
  await page.goto("/pdf-editor");
  await expect(
    page.getByRole("button", { name: "Browse Files", exact: true }),
  ).toBeEnabled();
  await page.getByLabel("Upload a PDF to edit").setInputFiles({
    name: "Delete.pdf",
    mimeType: "application/pdf",
    buffer: pdf(["REMOVE THIS TEXT"]),
  });
  await page
    .getByRole("button", { name: "Edit text: REMOVE THIS TEXT", exact: true })
    .click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "0 changes in this tab" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Edit text: REMOVE THIS TEXT", exact: true })
    .click();
  await page.getByLabel("Edit text on page", { exact: true }).fill("");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Edit text: REMOVE THIS TEXT",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  const responseEvent = page.waitForResponse(
    (r) => r.url().endsWith("/api/pdf-edit") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Save edited PDF", exact: true })
    .click();
  expect((await responseEvent).status()).toBe(200);
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  expect((await downloadEvent).suggestedFilename()).toBe("Delete.pdf");
});
