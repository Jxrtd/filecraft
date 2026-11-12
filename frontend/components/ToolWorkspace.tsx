"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { downloadName } from "@/lib/filenames";
import { unzipSync } from "fflate";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  UploadCloud,
  X,
  FileText,
  Download,
  Copy,
  Check,
  LoaderCircle,
  ShieldCheck,
  ImageIcon,
  RotateCcw,
} from "lucide-react";
import { apiBase, tools, ToolSlug, Limits } from "@/lib/tools";

type Picked = { file: File; id: string; url: string };
type Result = { url: string; name: string; type: string };
export default function ToolWorkspace({ slug }: { slug: ToolSlug }) {
  const tool = tools[slug];
  const [mode, setMode] = useState("pdf-word");
  const [files, setFiles] = useState<Picked[]>([]);
  const [pageSize, setPageSize] = useState("a4");
  const [format, setFormat] = useState("png");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const [ocrDone, setOcrDone] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [pages, setPages] = useState<{ url: string; name: string }[]>([]);
  const [dragging, setDragging] = useState(false);
  const [limits, setLimits] = useState<Limits | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const ownedUrls = useRef(new Set<string>());
  const abort = useRef<AbortController | null>(null);
  const operation =
    slug === "pdf-converter"
      ? mode
      : slug === "image-to-text"
        ? "ocr"
        : "remove-background";
  const multiple = operation === "images-pdf";
  const accept =
    operation === "word-pdf"
      ? ".doc,.docx"
      : operation === "office-pdf"
        ? ".xls,.xlsx,.ppt,.pptx"
        : operation === "pdf-images" || operation === "pdf-word"
          ? ".pdf"
          : multiple
            ? ".jpg,.jpeg,.png"
            : ".jpg,.jpeg,.png,.webp";
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
            "Cannot reach the processing server. Check the backend connection and reload this page.",
          );
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const urls = ownedUrls.current;
    return () => {
      abort.current?.abort();
      urls.forEach(URL.revokeObjectURL);
    };
  }, []);
  function own(blob: Blob) {
    const url = URL.createObjectURL(blob);
    ownedUrls.current.add(url);
    return url;
  }
  function release(url: string) {
    URL.revokeObjectURL(url);
    ownedUrls.current.delete(url);
  }
  function clearResult() {
    pages.forEach((p) => release(p.url));
    setPages([]);
    if (result) release(result.url);
    setResult(null);
    setText("");
    setOcrDone(false);
    setMessage("");
    setCopied(false);
  }
  function reset() {
    files.forEach((f) => release(f.url));
    setFiles([]);
    clearResult();
    setError("");
    if (input.current) input.current.value = "";
  }
  function select(incoming: FileList | File[] | null) {
    if (!incoming || busy || !limits) return;
    const selected = Array.from(incoming);
    const extensions = accept.split(",");
    if (!multiple && selected.length > 1) {
      setError("Choose one file at a time.");
      return;
    }
    const combined = multiple
      ? [...files.map((f) => f.file), ...selected]
      : selected;
    if (combined.length > limits.max_files) {
      setError(`Choose up to ${limits.max_files} images.`);
      return;
    }
    if (
      combined.some(
        (f) =>
          !extensions.includes(`.${f.name.split(".").pop()?.toLowerCase()}`),
      )
    ) {
      setError(
        "This file type is not supported. Check the supported formats below.",
      );
      return;
    }
    if (combined.some((f) => !f.size || f.size > limits.max_file_bytes)) {
      setError(
        `Choose non-empty files up to ${Math.floor(limits.max_file_bytes / 1048576)} MB each.`,
      );
      return;
    }
    if (
      combined.reduce((n, f) => n + f.size, 0) >
      limits.max_request_bytes - 65536
    ) {
      setError(
        "The combined files exceed the request limit. Remove a file and try again.",
      );
      return;
    }
    clearResult();
    setError("");
    if (!multiple) files.forEach((f) => release(f.url));
    setFiles((prev) => [
      ...(multiple ? prev : []),
      ...selected.map((file) => ({
        file,
        id: crypto.randomUUID(),
        url: own(file),
      })),
    ]);
  }
  useEffect(() => {
    const acceptsPastedImages =
      operation === "images-pdf" ||
      operation === "ocr" ||
      operation === "remove-background";
    if (!acceptsPastedImages) return;

    function handlePaste(event: ClipboardEvent) {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA")
      )
        return;

      const images = Array.from(event.clipboardData?.items || [])
        .filter(
          (item) => item.kind === "file" && item.type.startsWith("image/"),
        )
        .map((item, index) => {
          const image = item.getAsFile();
          if (!image) return null;
          const extension =
            image.type === "image/jpeg"
              ? "jpg"
              : image.type === "image/webp"
                ? "webp"
                : "png";
          return new File(
            [image],
            `pasted-image-${Date.now()}-${index + 1}.${extension}`,
            { type: image.type || `image/${extension}` },
          );
        })
        .filter((image): image is File => image !== null);

      if (!images.length) return;
      event.preventDefault();
      select(images);
    }

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  });
  function move(index: number, offset: number) {
    const next = [...files];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    setFiles(next);
    clearResult();
  }
  async function processFiles() {
    if (!files.length || busy || !limits) return;
    clearResult();
    setError("");
    setBusy(true);
    const controller = new AbortController();
    abort.current = controller;
    try {
      const body = new FormData();
      files.forEach(({ file }) => body.append("files", file));
      body.append("page_size", pageSize);
      body.append("image_format", format);
      const response = await fetch(`${apiBase}/api/${operation}`, {
        method: "POST",
        body,
        signal: controller.signal,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw Error(
          typeof data?.detail === "string"
            ? data.detail
            : `Processing failed (${response.status}). Please try again.`,
        );
      }
      if (operation === "ocr") {
        const data = await response.json();
        setText(data.text);
        setOcrDone(true);
        setMessage(
          data.text
            ? "Text extracted. Make it your own below."
            : "No readable text found. Try a sharper image with larger, well-lit English text.",
        );
      } else {
        const blob = await response.blob();
        const ext =
          operation === "pdf-word"
            ? "docx"
            : operation === "pdf-images"
              ? "zip"
              : operation === "remove-background"
                ? "png"
                : "pdf";
        if (ext === "zip") {
          try {
            const entries = unzipSync(
              new Uint8Array(await blob.arrayBuffer()),
              {
                filter: (entry) =>
                  /^page-00[1-6]\.(png|jpg)$/.test(entry.name) &&
                  entry.originalSize < 30 * 1024 * 1024,
              },
            );
            setPages(
              Object.entries(entries).map(([name, bytes]) => ({
                name,
                url: own(
                  new Blob([new Uint8Array(bytes)], {
                    type: name.endsWith("png") ? "image/png" : "image/jpeg",
                  }),
                ),
              })),
            );
          } catch {
            /* The ZIP remains downloadable if preview decoding fails. */
          }
        }
        setResult({
          url: own(blob),
          name: downloadName(files[0].file.name, ext),
          type: ext,
        });
        setMessage("All done. Your file is ready to download.");
      }
    } catch (e) {
      if (e instanceof Error && e.name !== "AbortError")
        setError(
          e.message === "Failed to fetch"
            ? "Could not connect to the server. Check your connection and try again."
            : e.message,
        );
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setError(
        "Clipboard access is unavailable. Select the text below and copy it with your keyboard.",
      );
    }
  }
  function downloadText() {
    const url = own(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = downloadName(files[0]?.file.name || "filecraft", "txt");
    a.click();
    setTimeout(() => release(url), 1000);
  }
  return (
    <div className={`workspace page-width ${tool.color}`}>
      <Link className="back-link" href="/">
        <ArrowLeft size={16} /> All tools
      </Link>
      <div className="workspace-heading">
        <div className="eyebrow">A LITTLE LESS FILE FRICTION</div>
        <h1>
          {tool.name}
          <span>.</span>
        </h1>
        <p>{tool.description}</p>
      </div>
      <div className="work-grid">
        <section className="work-panel" aria-label="File processing">
          <div className="panel-title">
            <span className="step-number">01</span>
            <h2>{tool.intro}</h2>
          </div>
          {slug === "pdf-converter" && (
            <fieldset className="mode-picker" disabled={busy}>
              <legend className="sr-only">Conversion type</legend>
              {[
                ["pdf-word", "PDF to Word"],
                ["word-pdf", "Word to PDF"],
                ["images-pdf", "Images to PDF"],
                ["office-pdf", "Excel / PowerPoint to PDF"],
                ["pdf-images", "PDF to images"],
              ].map(([value, label]) => (
                <label key={value} className={mode === value ? "chosen" : ""}>
                  <input
                    type="radio"
                    name="mode"
                    value={value}
                    checked={mode === value}
                    onChange={() => {
                      reset();
                      setMode(value);
                    }}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
          )}
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
              select(e.dataTransfer.files);
            }}
          >
            <span className="upload-icon">
              <UploadCloud size={29} strokeWidth={1.5} />
            </span>
            <h3>
              {files.length && multiple
                ? "Add a few more?"
                : "A fresh start for your files."}
            </h3>
            <p>
              Drag & drop {multiple ? "your images" : "a file"} here
              {(operation === "images-pdf" ||
                operation === "ocr" ||
                operation === "remove-background") &&
                ", paste an image,"}{" "}
              or
            </p>
            <button
              className="button primary"
              disabled={busy || !limits}
              onClick={() => input.current?.click()}
            >
              Browse Files <ArrowRight size={16} />
            </button>
            <input
              ref={input}
              type="file"
              accept={accept}
              multiple={multiple}
              className="sr-only"
              aria-label="Upload files"
              disabled={busy || !limits}
              onChange={(e) => {
                select(e.target.files);
                e.target.value = "";
              }}
            />
            <small>
              {accept.replaceAll(".", "").replaceAll(",", " · ").toUpperCase()}{" "}
              {limits &&
                ` / ${Math.floor(limits.max_file_bytes / 1048576)} MB per file`}
            </small>
          </div>
          {files.length > 0 && (
            <div className="selected">
              <div className="selected-heading">
                <span>
                  {files.length} {files.length === 1 ? "file" : "files"}{" "}
                  selected {multiple && "· PDF page order"}
                </span>
                <button disabled={busy} onClick={reset} className="text-button">
                  <RotateCcw size={13} /> Reset
                </button>
              </div>
              {files.map((f, i) => (
                <div className="file-row" key={f.id}>
                  {f.file.type.startsWith("image/") ? (
                    <img src={f.url} alt={`Preview of ${f.file.name}`} />
                  ) : (
                    <span className="file-symbol">
                      <FileText size={22} />
                    </span>
                  )}
                  <div className="file-info">
                    <strong>
                      {multiple && `${i + 1}. `}
                      {f.file.name}
                    </strong>
                    <span>{(f.file.size / 1024).toFixed(1)} KB</span>
                  </div>
                  {multiple && (
                    <>
                      <button
                        className="icon-button"
                        aria-label={`Move ${f.file.name} up`}
                        disabled={busy || i === 0}
                        onClick={() => move(i, -1)}
                      >
                        <ArrowUp size={16} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Move ${f.file.name} down`}
                        disabled={busy || i === files.length - 1}
                        onClick={() => move(i, 1)}
                      >
                        <ArrowDown size={16} />
                      </button>
                    </>
                  )}
                  <button
                    className="icon-button"
                    aria-label={`Remove ${f.file.name}`}
                    disabled={busy}
                    onClick={() => {
                      release(f.url);
                      setFiles(files.filter((x) => x.id !== f.id));
                      clearResult();
                    }}
                  >
                    <X size={17} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {slug === "pdf-converter" && (
            <div className="options">
              {mode === "images-pdf" ? (
                <label>
                  Page size
                  <select
                    value={pageSize}
                    disabled={busy}
                    onChange={(e) => {
                      setPageSize(e.target.value);
                      clearResult();
                    }}
                  >
                    <option value="a4">A4 · 210 × 297 mm</option>
                    <option value="letter">US Letter · 8.5 × 11 in</option>
                    <option value="original">Fit each image</option>
                  </select>
                </label>
              ) : mode === "pdf-images" ? (
                <label>
                  Image format
                  <select
                    value={format}
                    disabled={busy}
                    onChange={(e) => {
                      setFormat(e.target.value);
                      clearResult();
                    }}
                  >
                    <option value="png">PNG · lossless</option>
                    <option value="jpg">JPG · smaller files</option>
                  </select>
                </label>
              ) : (
                <p className="muted">
                  {mode === "pdf-word"
                    ? "Convert a text-based PDF to editable DOCX. Complex layouts may change. Scanned PDFs need OCR first; image-only PDFs are not supported."
                    : mode === "word-pdf"
                      ? "Convert one Word document (.doc or .docx) to PDF."
                      : "Convert one Excel or PowerPoint document to PDF."}
                </p>
              )}
            </div>
          )}
          <button
            className="button process-button"
            disabled={!files.length || busy || !limits}
            onClick={processFiles}
          >
            {busy ? (
              <>
                <LoaderCircle size={18} className="spin" /> Processing your{" "}
                {multiple ? "files" : "file"}…
              </>
            ) : (
              <>
                {operation === "ocr"
                  ? "Extract text"
                  : operation === "remove-background"
                    ? "Remove background"
                    : "Convert files"}
                <ArrowRight size={17} />
              </>
            )}
          </button>
          <div aria-live="polite" aria-atomic="true">
            {busy && (
              <p className="processing-note">
                This can take a moment. Keep this page open.
                {operation === "remove-background" &&
                  " The first request may take longer while the model downloads."}
              </p>
            )}
            {message && (
              <p className="notice success">
                <Check size={17} />
                {message}
              </p>
            )}
          </div>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
        </section>
        <aside className="tool-sidebar">
          <div className="sidebar-tip">
            <span className="eyebrow">GOOD TO KNOW</span>
            <h2>
              Small steps.
              <br />
              Useful results.
            </h2>
            <ol>
              <li>
                <span>1</span>Choose your file{multiple ? "s" : ""}.
              </li>
              <li>
                <span>2</span>
                {multiple
                  ? "Arrange pages and choose a size."
                  : "Let FileCraft do its thing."}
              </li>
              <li>
                <span>3</span>Download and get on with your day.
              </li>
            </ol>
          </div>
          <div className="supported">
            <h3>Supported formats</h3>
            {slug === "pdf-converter" ? (
              <ul>
                <li>JPG / PNG → PDF</li>
                <li>PDF &rarr; Word (DOCX)</li>
                <li>DOC / DOCX → PDF</li>
                <li>XLS / XLSX → PDF</li>
                <li>PPT / PPTX → PDF</li>
                <li>PDF → PNG / JPG in a ZIP</li>
              </ul>
            ) : (
              <p>
                JPG, PNG, and WebP
                <br />
                {slug === "image-to-text"
                  ? "English text → editable TXT"
                  : "Output → transparent PNG"}
              </p>
            )}
            {limits && (
              <p className="muted">
                Up to {limits.max_files} images per PDF, {limits.max_pages} PDF
                pages, and {Math.floor(limits.max_request_bytes / 1048576)} MB
                per request.
              </p>
            )}
          </div>
          <div className="privacy">
            <ShieldCheck size={22} />
            <div>
              <h3>A temporary stop.</h3>
              <p>
                Uploads are deleted when processing fails or OCR finishes.
                Converted files are deleted after the server sends the download.
                Abandoned server files are cleaned within{" "}
                {limits
                  ? Math.ceil(limits.abandoned_retention_seconds / 60) + 1
                  : "about 16"}{" "}
                minutes. Previews stay in this tab until reset or closed.
              </p>
            </div>
          </div>
        </aside>
      </div>
      {ocrDone && (
        <section className="result-panel">
          <div className="result-heading">
            <h2>Your words, ready to work.</h2>
            <div className="result-actions">
              <button
                className="button secondary"
                disabled={!text}
                onClick={copy}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}{" "}
                {copied ? "Copied" : "Copy Text"}
              </button>
              <button
                className="button primary"
                disabled={!text}
                onClick={downloadText}
              >
                <Download size={16} /> Download TXT
              </button>
            </div>
          </div>
          <label className="text-label" htmlFor="extracted-text">
            Extracted text · editable
          </label>
          <textarea
            id="extracted-text"
            rows={12}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setCopied(false);
            }}
            placeholder="No readable text was found. You can type here or try another image."
          />
        </section>
      )}
      {result && (
        <section className="result-panel">
          <div className="result-heading">
            <h2>A fresh file. All yours.</h2>
            <a
              className="button primary"
              href={result.url}
              download={result.name}
            >
              <Download size={17} /> Download {result.type.toUpperCase()}
            </a>
          </div>
          {result.type === "png" ? (
            <div className="comparison">
              <figure>
                <div className="image-preview">
                  <img src={files[0]?.url} alt="Original uploaded image" />
                </div>
                <figcaption>Original</figcaption>
              </figure>
              <figure>
                <div className="image-preview checkerboard">
                  <img src={result.url} alt="Image with background removed" />
                </div>
                <figcaption>Background removed · transparent PNG</figcaption>
              </figure>
            </div>
          ) : result.type === "docx" ? (
            <>
              <div className="zip-result">
                <FileText size={35} />
                <h3>Your Word document is ready.</h3>
                <p>
                  Download the DOCX and open it in Word or LibreOffice to edit.
                  Complex layouts may differ from the original. The preview
                  below shows your original PDF.
                </p>
              </div>
              <iframe
                className="pdf-preview"
                src={files[0]?.url}
                title="Original PDF before Word conversion"
              />
            </>
          ) : result.type === "pdf" ? (
            <iframe
              className="pdf-preview"
              src={result.url}
              title="Converted PDF preview"
            />
          ) : (
            <div className="zip-result">
              {pages.length > 0 && (
                <div className="page-previews">
                  {pages.map((page) => (
                    <figure key={page.name}>
                      <img src={page.url} alt={page.name} />
                      <figcaption>{page.name}</figcaption>
                    </figure>
                  ))}
                </div>
              )}
              <ImageIcon size={35} />
              <h3>Every page, an image.</h3>
              <p>
                Your PDF pages are packaged into one ZIP. Download and unzip it
                to view your images.
              </p>
            </div>
          )}
        </section>
      )}
      <p className="workspace-end">
        No sign-up. No extra steps. Just a useful little tool.
      </p>
    </div>
  );
}
