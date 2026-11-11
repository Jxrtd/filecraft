"use client";
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  UploadCloud,
  X,
  Download,
  LoaderCircle,
  FileText,
  Plus,
} from "lucide-react";
import { apiBase, Limits, tools } from "@/lib/tools";
import { downloadName } from "@/lib/filenames";
import PdfDocumentEditor from "@/components/PdfDocumentEditor";
import type { PdfEdit } from "@/lib/pdf-editor";
import PdfResult from "@/components/PdfResult";

type Picked = { id: string; file: File; document: PDFDocumentProxy };
export default function PdfWorkspace({
  slug,
}: {
  slug: "pdf-editor" | "merge-pdf";
}) {
  const merging = slug === "merge-pdf";
  const tool = tools[slug];
  const [files, setFiles] = useState<Picked[]>([]);
  const [limits, setLimits] = useState<Limits | null>(null);
  const [phase, setPhase] = useState<"idle" | "loading" | "processing">("idle");
  const busy = phase !== "idle";
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [dragging, setDragging] = useState(false);
  const [order, setOrder] = useState<number[]>([]);
  const [selected, setSelected] = useState(0);
  const [edits, setEdits] = useState<PdfEdit[]>([]);
  const [result, setResult] = useState<{ url: string; name: string } | null>(
    null,
  );
  const input = useRef<HTMLInputElement>(null);
  const documents = useRef(new Set<PDFDocumentProxy>());
  const urls = useRef(new Set<string>());
  const request = useRef<AbortController | null>(null);
  const disposed = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${apiBase}/api/config`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then(setLimits)
      .catch((e) => {
        if (e.name !== "AbortError")
          setError(
            "Cannot reach the backend. Reload after the processing server is running.",
          );
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    disposed.current = false;
    const docs = documents.current;
    const owned = urls.current;
    return () => {
      disposed.current = true;
      request.current?.abort();
      docs.forEach((doc) => {
        void doc.loadingTask.destroy();
      });
      owned.forEach(URL.revokeObjectURL);
    };
  }, []);
  function invalidate() {
    if (result) {
      URL.revokeObjectURL(result.url);
      urls.current.delete(result.url);
    }
    setResult(null);
    setMessage("");
  }
  function reset() {
    files.forEach((item) => {
      documents.current.delete(item.document);
      void item.document.loadingTask.destroy();
    });
    setFiles([]);
    setOrder([]);
    setEdits([]);
    setSelected(0);
    invalidate();
    setError("");
  }
  async function select(incoming: FileList | null) {
    if (!incoming || !limits || busy) return;
    const chosen = Array.from(incoming);
    if (!chosen.length) return;
    if (chosen.some((f) => !f.name.toLowerCase().endsWith(".pdf"))) {
      setError("Choose PDF files only.");
      return;
    }
    if (!merging && chosen.length !== 1) {
      setError("Choose one PDF to edit.");
      return;
    }
    const all = merging ? [...files.map((f) => f.file), ...chosen] : chosen;
    if (
      all.length > limits.max_files ||
      all.some((f) => !f.size || f.size > limits.max_file_bytes) ||
      all.reduce((n, f) => n + f.size, 0) > limits.max_request_bytes - 65536
    ) {
      setError(
        `Choose up to ${limits.max_files} PDFs, ${Math.floor(limits.max_file_bytes / 1048576)} MB per file, within the ${Math.floor(limits.max_request_bytes / 1048576)} MB request limit.`,
      );
      return;
    }
    setPhase("loading");
    setError("");
    const loaded: Picked[] = [];
    try {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf-assets/pdf.worker.min.mjs";
      for (const file of chosen) {
        const task = pdfjs.getDocument({
          data: new Uint8Array(await file.arrayBuffer()),
          cMapUrl: "/pdf-assets/cmaps/",
          cMapPacked: true,
          standardFontDataUrl: "/pdf-assets/standard_fonts/",
          wasmUrl: "/pdf-assets/wasm/",
        });
        let document: PDFDocumentProxy;
        try {
          document = await task.promise;
        } catch {
          void task.destroy();
          throw Error(
            "This PDF could not be opened. Choose an unlocked, readable PDF.",
          );
        }
        documents.current.add(document);
        loaded.push({ id: crypto.randomUUID(), file, document });
        if (document.numPages > limits.max_pages)
          throw Error(`A PDF exceeds the ${limits.max_pages}-page limit.`);
      }
      const combined = merging ? [...files, ...loaded] : loaded;
      if (
        merging &&
        combined.reduce((n, f) => n + f.document.numPages, 0) > limits.max_pages
      )
        throw Error(
          `The combined PDF may contain up to ${limits.max_pages} pages.`,
        );
      if (disposed.current) {
        loaded.forEach((item) => {
          documents.current.delete(item.document);
          void item.document.loadingTask.destroy();
        });
        return;
      }
      if (!merging) {
        files.forEach((item) => {
          documents.current.delete(item.document);
          void item.document.loadingTask.destroy();
        });
        setOrder(
          Array.from({ length: loaded[0].document.numPages }, (_, i) => i),
        );
        setSelected(0);
        setEdits([]);
      }
      invalidate();
      setFiles(combined);
    } catch (e) {
      loaded.forEach((item) => {
        documents.current.delete(item.document);
        void item.document.loadingTask.destroy();
      });
      if (!disposed.current)
        setError(e instanceof Error ? e.message : "Could not open this PDF.");
    } finally {
      if (!disposed.current) setPhase("idle");
    }
  }
  function moveFile(index: number, offset: number) {
    const next = [...files];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    setFiles(next);
    invalidate();
  }
  function movePage(index: number, offset: number) {
    const next = [...order];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    setOrder(next);
    invalidate();
  }
  function removePage(page: number) {
    const next = order.filter((p) => p !== page);
    setOrder(next);
    setEdits(edits.filter((edit) => edit.page !== page));
    if (selected === page) setSelected(next[0]);
    invalidate();
  }
  async function processFiles() {
    if (busy || !files.length || !limits) return;
    setPhase("processing");
    setError("");
    invalidate();
    const controller = new AbortController();
    request.current = controller;
    try {
      const body = new FormData();
      files.forEach((item) => body.append("files", item.file));
      if (!merging) {
        body.append("pages", JSON.stringify(order));
        body.append(
          "edits",
          JSON.stringify(
            edits.map((edit) => {
              const payload = { ...edit };
              delete payload.id;
              return payload;
            }),
          ),
        );
      }
      const response = await fetch(
        `${apiBase}/api/${merging ? "pdf-merge" : "pdf-edit"}`,
        { method: "POST", body, signal: controller.signal },
      );
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw Error(
          typeof data?.detail === "string"
            ? data.detail
            : "Could not process this PDF. Please try again.",
        );
      }
      const url = URL.createObjectURL(await response.blob());
      urls.current.add(url);
      if (disposed.current) {
        URL.revokeObjectURL(url);
        urls.current.delete(url);
        return;
      }
      setResult({ url, name: downloadName(files[0].file.name, "pdf") });
      setMessage(
        merging
          ? "Your PDFs are combined and ready to download."
          : "Your edited PDF is ready to download.",
      );
    } catch (e) {
      if (e instanceof Error && e.name !== "AbortError" && !disposed.current)
        setError(
          e.message === "Failed to fetch"
            ? "Cannot reach the server. Check your connection and retry."
            : e.message,
        );
    } finally {
      request.current = null;
      if (!disposed.current) setPhase("idle");
    }
  }
  const totalPages = files.reduce((n, f) => n + f.document.numPages, 0);
  return (
    <div
      className={`workspace page-width ${tool.color} ${!merging && files.length ? "pdf-doc-loaded" : ""}`}
    >
      <Link href="/" className="back-link">
        <ArrowLeft size={16} /> All tools
      </Link>
      <div className="workspace-heading">
        <div className="eyebrow">WORK DIRECTLY WITH YOUR PDF</div>
        <h1>
          {tool.name}
          <span>.</span>
        </h1>
        <p>{tool.description}</p>
      </div>
      <section className="work-panel">
        <div className="panel-title">
          <span className="step-number">01</span>
          <h2>{tool.intro}</h2>
        </div>
        <div
          className={`dropzone ${dragging ? "dragging" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            if (!busy) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void select(e.dataTransfer.files);
          }}
        >
          <span className="upload-icon">
            <UploadCloud size={29} />
          </span>
          <h3>
            {merging ? "Bring your PDFs together." : "Make your PDF yours."}
          </h3>
          <p>Drag & drop {merging ? "PDF files" : "a PDF"} here, or</p>
          <button
            className="button primary"
            disabled={busy || !limits}
            onClick={() => input.current?.click()}
          >
            Browse Files <Plus size={16} />
          </button>
          <input
            ref={input}
            type="file"
            accept=".pdf"
            multiple={merging}
            className="sr-only"
            aria-label={
              merging ? "Upload PDFs to combine" : "Upload a PDF to edit"
            }
            disabled={busy || !limits}
            onChange={(e) => {
              void select(e.target.files);
              e.target.value = "";
            }}
          />
          <small>
            {limits
              ? `PDF · ${Math.floor(limits.max_file_bytes / 1048576)} MB per file · ${limits.max_pages} ${merging ? "combined " : ""}pages maximum`
              : "Connecting to processing server…"}
          </small>
        </div>
        {files.length > 0 && (
          <div className="selected">
            <div className="selected-heading">
              <span>
                {files.length} {files.length === 1 ? "PDF" : "PDFs"} ·{" "}
                {totalPages} source pages{merging ? " · combine order" : ""}
              </span>
              <button className="text-button" disabled={busy} onClick={reset}>
                Reset
              </button>
            </div>
            {files.map((item, index) => (
              <div className="file-row" key={item.id}>
                <span className="file-symbol">
                  <FileText size={22} />
                </span>
                <div className="file-info">
                  <strong>
                    {merging && `${index + 1}. `}
                    {item.file.name}
                  </strong>
                  <span>
                    {item.document.numPages} pages ·{" "}
                    {(item.file.size / 1048576).toFixed(2)} MB
                  </span>
                </div>
                {merging && (
                  <>
                    <button
                      className="icon-button"
                      aria-label={`Move ${item.file.name} up`}
                      disabled={busy || index === 0}
                      onClick={() => moveFile(index, -1)}
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Move ${item.file.name} down`}
                      disabled={busy || index === files.length - 1}
                      onClick={() => moveFile(index, 1)}
                    >
                      <ArrowDown size={16} />
                    </button>
                  </>
                )}
                <button
                  className="icon-button"
                  aria-label={`Remove ${item.file.name}`}
                  disabled={busy}
                  onClick={() => {
                    if (!merging) {
                      reset();
                      return;
                    }
                    documents.current.delete(item.document);
                    void item.document.loadingTask.destroy();
                    setFiles(files.filter((f) => f.id !== item.id));
                    invalidate();
                  }}
                >
                  <X size={17} />
                </button>
              </div>
            ))}
          </div>
        )}
        {!merging && files.length > 0 && (
          <PdfDocumentEditor
            file={files[0].file}
            document={files[0].document}
            order={order}
            selected={selected}
            edits={edits}
            busy={busy}
            error={error}
            ready={!!result}
            onChange={(next) => {
              setEdits(next);
              invalidate();
            }}
            onPage={setSelected}
            onMovePage={movePage}
            onRemovePage={removePage}
            onSave={() => void processFiles()}
            onDownload={() => {
              if (result) {
                const link = document.createElement("a");
                link.href = result.url;
                link.download = result.name;
                link.click();
              }
            }}
            onOpen={() => input.current?.click()}
            onReset={reset}
            onError={setError}
          />
        )}
        <button
          className="button process-button"
          disabled={
            busy || (merging ? files.length < 2 : !files.length) || !limits
          }
          onClick={() => void processFiles()}
        >
          {busy ? (
            <>
              <LoaderCircle className="spin" size={18} />
              {phase === "loading" ? "Opening PDF…" : "Processing PDF…"}
            </>
          ) : (
            <>
              {merging ? "Combine PDFs" : "Save edited PDF"}
              <ArrowRight size={17} />
            </>
          )}
        </button>
        <div aria-live="polite">
          {message && <p className="notice success">{message}</p>}
        </div>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <p className="pdf-editor-help">
          {merging
            ? "All pages are kept in file order. The download uses the first PDF’s filename."
            : "Your original file is unchanged. Download the edited PDF with the same filename."}{" "}
          Processing uses temporary server files, deleted after the result is
          sent; failures are cleaned immediately. Abandoned server files are
          cleaned within{" "}
          {limits ? Math.ceil(limits.abandoned_retention_seconds / 60) + 1 : 16}{" "}
          minutes while the server runs.
        </p>
      </section>
      {result && (
        <section className="result-panel">
          <div className="result-heading">
            <h2>
              {merging
                ? "Together, in one PDF."
                : "Your PDF, with your changes."}
            </h2>
            <a
              className="button primary"
              href={result.url}
              download={result.name}
            >
              <Download size={17} /> Download PDF
            </a>
          </div>
          <PdfResult key={result.url} url={result.url} />
        </section>
      )}
    </div>
  );
}
