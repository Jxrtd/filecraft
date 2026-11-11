"use client";
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

export default function PdfPage({
  document,
  page,
  onSize,
}: {
  document: PDFDocumentProxy;
  page: number;
  onSize: (width: number) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let render:
      | ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]>
      | undefined;
    document
      .getPage(page + 1)
      .then(async (pdfPage) => {
        if (cancelled || !canvas.current) return;
        const base = pdfPage.getViewport({ scale: 1 });
        onSize(base.width);
        const scale = Math.min(
          1.7,
          Math.sqrt(6000000 / (base.width * base.height)),
        );
        const viewport = pdfPage.getViewport({ scale });
        const target = canvas.current;
        target.width = Math.ceil(viewport.width);
        target.height = Math.ceil(viewport.height);
        const context = target.getContext("2d");
        if (!context)
          throw Error("Page preview is unavailable in this browser.");
        render = pdfPage.render({
          canvas: target,
          canvasContext: context,
          viewport,
        });
        await render.promise;
        if (!cancelled) setReady(true);
      })
      .catch((e) => {
        if (!cancelled && e.name !== "RenderingCancelledException")
          setError("Could not render this PDF page. Try another PDF.");
      });
    return () => {
      cancelled = true;
      render?.cancel();
    };
  }, [document, page, onSize]);
  return (
    <>
      <canvas
        ref={canvas}
        aria-label={`PDF page ${page + 1}`}
        className="pdf-page-canvas"
      />
      {!ready && !error && (
        <p className="pdf-render-status" role="status">
          Rendering page…
        </p>
      )}
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
    </>
  );
}
