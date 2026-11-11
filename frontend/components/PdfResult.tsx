"use client";
import { useCallback, useEffect, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import { ArrowLeft, ArrowRight } from "lucide-react";
import PdfPage from "@/components/PdfPage";

export default function PdfResult({ url }: { url: string }) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(0);
  const [error, setError] = useState("");
  const onSize = useCallback(() => {}, []);
  useEffect(() => {
    let active = true;
    let task: PDFDocumentLoadingTask | undefined;
    const controller = new AbortController();
    async function load() {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf-assets/pdf.worker.min.mjs";
      const response = await fetch(url, { signal: controller.signal });
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!active) return;
      task = pdfjs.getDocument({
        data: bytes,
        cMapUrl: "/pdf-assets/cmaps/",
        cMapPacked: true,
        standardFontDataUrl: "/pdf-assets/standard_fonts/",
        wasmUrl: "/pdf-assets/wasm/",
      });
      const result = await task.promise;
      if (active) setDocument(result);
    }
    void load().catch(() => {
      if (active)
        setError(
          "The PDF is ready to download, but the preview could not be opened.",
        );
    });
    return () => {
      active = false;
      controller.abort();
      void task?.destroy();
    };
  }, [url]);
  return (
    <div className="pdf-result-view">
      {error ? (
        <p className="notice error" role="alert">
          {error}
        </p>
      ) : document ? (
        <>
          <div className="pdf-result-navigation">
            <button
              className="button secondary"
              disabled={page === 0}
              aria-label="Previous result page"
              onClick={() => setPage(page - 1)}
            >
              <ArrowLeft size={16} />
            </button>
            <span aria-live="polite">
              Page {page + 1} of {document.numPages}
            </span>
            <button
              className="button secondary"
              disabled={page === document.numPages - 1}
              aria-label="Next result page"
              onClick={() => setPage(page + 1)}
            >
              <ArrowRight size={16} />
            </button>
          </div>
          <div className="pdf-result-page">
            <PdfPage
              key={page}
              document={document}
              page={page}
              onSize={onSize}
            />
          </div>
        </>
      ) : (
        <p role="status">Opening your result…</p>
      )}
    </div>
  );
}
