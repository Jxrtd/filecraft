export const tools = {
  "pdf-editor": {
    name: "PDF Editor",
    intro: "A few changes. Still your PDF.",
    description:
      "Add or replace text, highlight areas, and reorder or delete pages directly in your PDF.",
    color: "lavender",
  },
  "merge-pdf": {
    name: "Combine PDFs",
    intro: "Separate files. One useful PDF.",
    description:
      "Combine multiple PDFs into one document. Choose the file order and keep every page.",
    color: "sage",
  },
  "pdf-converter": {
    name: "PDF Converter",
    intro: "A better format is just a file away.",
    description:
      "Convert PDF to Word, Word to PDF, images and Office documents to PDF, or PDF pages to images.",
    color: "peach",
  },
  "image-to-text": {
    name: "Image to Text",
    intro: "Good words deserve to be editable.",
    description:
      "Extract English text from an image, then edit, copy, or download it.",
    color: "lavender",
  },
  "remove-background": {
    name: "Remove Background",
    intro: "Your subject. A clean slate.",
    description:
      "Remove the background from your image and download a transparent PNG.",
    color: "sage",
  },
} as const;
export type ToolSlug = keyof typeof tools;
export type Limits = {
  max_file_bytes: number;
  max_request_bytes: number;
  max_files: number;
  max_pages: number;
  abandoned_retention_seconds: number;
};
export const apiBase = process.env.NEXT_PUBLIC_API_URL || "";
