"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  ArrowUp,
  ArrowDown,
  Trash2,
  Undo2,
  Redo2,
  Type,
  MousePointer2,
  Highlighter,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  FileText,
  FolderOpen,
  Download,
  LoaderCircle,
  Plus,
  Minus,
  X,
} from "lucide-react";
import PdfPage from "@/components/PdfPage";
import { textBlocks } from "@/lib/pdf-editor";
import type { PdfEdit, Rect, TextBlock } from "@/lib/pdf-editor";

type Draft = PdfEdit & { id: string };
type Format = Pick<
  PdfEdit,
  | "font_size"
  | "font_family"
  | "bold"
  | "italic"
  | "underline"
  | "color"
  | "align"
>;
const defaults: Format = {
  font_size: 14,
  font_family: "sans-serif",
  bold: false,
  italic: false,
  underline: false,
  color: "#263e34",
  align: "left",
};
function position(rect: Rect): CSSProperties {
  return {
    left: `${rect[0] * 100}%`,
    top: `${rect[1] * 100}%`,
    width: `${(rect[2] - rect[0]) * 100}%`,
    height: `${(rect[3] - rect[1]) * 100}%`,
  };
}
function formatting(edit: PdfEdit, width: number): CSSProperties {
  return {
    fontSize: `${(edit.font_size / width) * 100}cqw`,
    fontFamily: edit.font_family || "sans-serif",
    fontWeight: edit.bold ? 700 : 400,
    fontStyle: edit.italic ? "italic" : "normal",
    textDecoration: edit.underline ? "underline" : "none",
    textAlign: edit.align || "left",
    color: edit.color,
  };
}

function DocumentPaper({
  document,
  page,
  edits,
  draft,
  mode,
  busy,
  onBegin,
  onDraft,
  onAdd,
  onBlur,
  onDimensions,
}: {
  document: PDFDocumentProxy;
  page: number;
  edits: PdfEdit[];
  draft: Draft | null;
  mode: "edit" | "text" | "highlight";
  busy: boolean;
  onBegin: (block: TextBlock) => void;
  onDraft: (draft: Draft) => void;
  onAdd: (point: [number, number]) => void;
  onBlur: () => void;
  onDimensions: (width: number, height: number) => void;
}) {
  const [blocks, setBlocks] = useState<TextBlock[]>([]);
  const [width, setWidth] = useState(612);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [textError, setTextError] = useState("");
  const start = useRef<[number, number] | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const onSize = useCallback((value: number) => setWidth(value), []);
  useEffect(() => {
    let active = true;
    void textBlocks(document, page)
      .then((result) => {
        if (active) {
          setBlocks(result.blocks);
          onDimensions(result.width, result.height);
        }
      })
      .catch(() => {
        if (active)
          setTextError(
            "Text could not be selected on this page. You can still add text or highlights.",
          );
      });
    return () => {
      active = false;
    };
  }, [document, page, onDimensions]);
  const activeId = draft?.id;
  useEffect(() => {
    if (activeId) {
      textarea.current?.focus();
      textarea.current?.select();
    }
  }, [activeId]);
  useEffect(() => {
    const element = textarea.current;
    if (!draft || !element || busy || draft.rect[3] >= 0.995) return;
    if (!edits.some((edit) => edit.id === draft.id)) return;
    if (element.scrollHeight <= element.clientHeight + 1) return;
    const paper = element.closest(".doc-paper")?.getBoundingClientRect();
    if (!paper?.height) return;
    const bottom = Math.min(
      0.995,
      draft.rect[1] + (element.scrollHeight + 8) / paper.height,
    );
    if (bottom > draft.rect[3] + 0.001) {
      onDraft({
        ...draft,
        rect: [draft.rect[0], draft.rect[1], draft.rect[2], bottom],
      });
    }
  }, [draft, busy, onDraft, edits]);
  function point(event: PointerEvent<HTMLDivElement>): [number, number] {
    const bounds = event.currentTarget.getBoundingClientRect();
    return [
      Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    ];
  }
  function down(event: PointerEvent<HTMLDivElement>) {
    if (
      busy ||
      event.button !== 0 ||
      (event.target as HTMLElement).closest("button,textarea,.doc-draft")
    )
      return;
    if (mode === "highlight") {
      event.preventDefault();
      start.current = point(event);
      event.currentTarget.setPointerCapture(event.pointerId);
    } else {
      onAdd(point(event));
    }
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    const end = point(event);
    setSelection([
      Math.min(start.current[0], end[0]),
      Math.min(start.current[1], end[1]),
      Math.max(start.current[0], end[0]),
      Math.max(start.current[1], end[1]),
    ]);
  }
  function up(event: PointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    const end = point(event);
    const rect: Rect = [
      Math.min(start.current[0], end[0]),
      Math.min(start.current[1], end[1]),
      Math.max(start.current[0], end[0]),
      Math.max(start.current[1], end[1]),
    ];
    start.current = null;
    setSelection(null);
    if (rect[2] - rect[0] > 0.005 && rect[3] - rect[1] > 0.005)
      onDraft({
        id: crypto.randomUUID(),
        page,
        kind: "highlight",
        rect,
        text: "",
        font_size: 14,
        color: "#e3b735",
      });
  }
  return (
    <div
      className={`doc-paper mode-${mode}`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => {
        start.current = null;
        setSelection(null);
      }}
    >
      <PdfPage document={document} page={page} onSize={onSize} />
      {mode === "edit" &&
        blocks
          .filter(
            (block) =>
              !edits.some((edit) => edit.id === block.id) &&
              draft?.id !== block.id,
          )
          .map((block) => (
            <button
              key={block.id}
              className="doc-source-text"
              style={position(block.rect)}
              disabled={busy}
              aria-label={`Edit text: ${block.text}`}
              onClick={(event) => {
                event.stopPropagation();
                onBegin(block);
              }}
            />
          ))}
      {edits
        .filter((edit) => edit.kind === "replace" && edit.source_rect)
        .map((edit) => (
          <div
            key={`cover-${edit.id}`}
            className="doc-source-cover"
            aria-hidden="true"
            style={position(edit.source_rect!)}
          />
        ))}
      {edits
        .filter((edit) => edit.id !== draft?.id)
        .map((edit) =>
          edit.kind === "highlight" ? (
            <div
              key={edit.id}
              className="doc-highlight"
              style={position(edit.rect)}
              aria-label="Highlight"
            />
          ) : (
            <button
              key={edit.id}
              disabled={busy}
              className="doc-saved-text"
              aria-label={`Edit changed text: ${edit.text || "deleted text"}`}
              style={{ ...position(edit.rect), ...formatting(edit, width) }}
              onClick={(event) => {
                event.stopPropagation();
                onDraft({ ...edit, id: edit.id!, text: edit.text });
              }}
            >
              {edit.text || " "}
            </button>
          ),
        )}
      {draft && draft.page === page && (
        <div className="doc-draft" style={position(draft.rect)}>
          <textarea
            ref={textarea}
            aria-label="Edit text on page"
            maxLength={2000}
            disabled={busy}
            value={draft.text}
            placeholder="Type here…"
            style={formatting(draft, width)}
            onChange={(event) =>
              onDraft({ ...draft, text: event.target.value })
            }
            onBlur={onBlur}
          />
        </div>
      )}
      {selection && (
        <div
          aria-hidden="true"
          className="pdf-selection"
          style={position(selection)}
        />
      )}
      {textError && (
        <p className="doc-paper-message" role="status">
          {textError}
        </p>
      )}
    </div>
  );
}

export default function PdfDocumentEditor({
  file,
  document,
  order,
  selected,
  edits,
  busy,
  error,
  ready,
  onChange,
  onPage,
  onMovePage,
  onRemovePage,
  onSave,
  onDownload,
  onOpen,
  onReset,
  onError,
}: {
  file: File;
  document: PDFDocumentProxy;
  order: number[];
  selected: number;
  edits: PdfEdit[];
  busy: boolean;
  error: string;
  ready: boolean;
  onChange: (edits: PdfEdit[]) => void;
  onPage: (page: number) => void;
  onMovePage: (index: number, offset: number) => void;
  onRemovePage: (page: number) => void;
  onSave: () => void;
  onDownload: () => void;
  onOpen: () => void;
  onReset: () => void;
  onError: (message: string) => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [format, setFormat] = useState<Format>(defaults);
  const [mode, setMode] = useState<"edit" | "text" | "highlight">("edit");
  const [zoom, setZoom] = useState(100);
  const [dimensions, setDimensions] = useState({ width: 612, height: 792 });
  const [history, setHistory] = useState<PdfEdit[][]>([]);
  const [future, setFuture] = useState<PdfEdit[][]>([]);
  const onDimensions = useCallback(
    (width: number, height: number) => setDimensions({ width, height }),
    [],
  );
  const current = draft ?? format;
  function change(next: PdfEdit[]) {
    setHistory((previous) => [...previous.slice(-99), edits]);
    setFuture([]);
    onChange(next);
    onError("");
  }
  function commit(value: Draft) {
    if (value.kind !== "highlight") setDraft(value);
    if (value.kind === "text" && !value.text.trim()) {
      if (edits.some((edit) => edit.id === value.id))
        change(edits.filter((edit) => edit.id !== value.id));
      return;
    }
    const exists = edits.some((edit) => edit.id === value.id);
    if (!exists && edits.length >= 100) {
      onError("Save up to 100 edited text blocks or highlights at a time.");
      return;
    }
    change(
      exists
        ? edits.map((edit) => (edit.id === value.id ? value : edit))
        : [...edits, value],
    );
  }
  function openBlock(block: TextBlock) {
    if (edits.length >= 100) {
      onError(
        "The 100-change limit has been reached. Undo a change before editing another text block.",
      );
      return;
    }
    const [x0, y0, x1, y1] = block.rect;
    const rect: Rect = [
      x0,
      y0,
      Math.min(1, block.available_right ?? Math.max(x1 + 0.025, x0 + 0.3)),
      Math.min(
        1,
        Math.max(y1, y0 + (block.font_size * 1.85) / dimensions.height),
      ),
    ];
    setDraft({
      id: block.id,
      page: selected,
      kind: "replace",
      rect,
      source_rect: block.rect,
      text: block.text,
      ...defaults,
      font_size: block.font_size,
      font_family: block.font_family,
    });
    setMode("edit");
    onError("");
  }
  function beginText(point: [number, number] = [0.12, 0.18]) {
    if (edits.length >= 100) {
      onError("The 100-change limit has been reached.");
      return;
    }
    const x = Math.min(point[0], 0.8),
      y = Math.min(point[1], 0.9);
    setDraft({
      id: crypto.randomUUID(),
      page: selected,
      kind: "text",
      rect: [x, y, Math.min(0.98, x + 0.45), Math.min(0.99, y + 0.12)],
      text: "",
      ...format,
    });
    setMode("edit");
    onError("");
  }
  function applyFormat(update: Partial<Format>) {
    setFormat((previous) => ({ ...previous, ...update }));
    if (draft) commit({ ...draft, ...update });
  }
  function undo() {
    if (!history.length) return;
    setFuture((previous) => [...previous, edits]);
    onChange(history[history.length - 1]);
    setHistory(history.slice(0, -1));
    setDraft(null);
    onError("");
  }
  function redo() {
    if (!future.length) return;
    setHistory((previous) => [...previous, edits]);
    onChange(future[future.length - 1]);
    setFuture(future.slice(0, -1));
    setDraft(null);
    onError("");
  }
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (!(event.ctrlKey || event.metaKey) || busy) return;
    const key = event.key.toLowerCase();
    if (key === "s") {
      event.preventDefault();
      onSave();
    } else if (key === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    } else if (key === "y") {
      event.preventDefault();
      redo();
    } else if (key === "b" || key === "i" || key === "u") {
      event.preventDefault();
      const field = key === "b" ? "bold" : key === "i" ? "italic" : "underline";
      applyFormat({ [field]: !current[field] });
    }
  }
  function sizeBox(axis: 2 | 3, amount: number) {
    if (!draft) return;
    const rect = [...draft.rect] as Rect;
    rect[axis] = Math.min(
      0.99,
      Math.max(draft.rect[axis - 2] + 0.04, rect[axis] + amount),
    );
    const next = { ...draft, rect };
    setDraft(next);
    if (edits.some((edit) => edit.id === draft.id)) commit(next);
  }
  function selectPage(page: number) {
    setDraft(null);
    onPage(page);
  }
  return (
    <div className="document-editor" onKeyDown={keyboard}>
      <div className="doc-titlebar">
        <span className="doc-file-icon">
          <FileText size={25} />
        </span>
        <div className="doc-title">
          <h2 title={file.name}>{file.name}</h2>
          <span role="status">
            {busy
              ? "Saving PDF…"
              : error
                ? "Changes not saved"
                : ready
                  ? "PDF ready to download"
                  : `${edits.length} ${edits.length === 1 ? "change" : "changes"} in this tab`}
          </span>
        </div>
        <button
          className="button secondary doc-open"
          disabled={busy}
          onClick={onOpen}
        >
          <FolderOpen size={16} />
          Open PDF
        </button>
        <button
          className="button primary"
          disabled={busy}
          onClick={ready ? onDownload : onSave}
        >
          {busy ? (
            <LoaderCircle size={16} className="spin" />
          ) : (
            <Download size={16} />
          )}
          <span>{ready ? "Download PDF" : "Save edited PDF"}</span>
        </button>
        <button
          className="icon-button"
          aria-label="Close document"
          disabled={busy}
          onClick={onReset}
        >
          <X size={17} />
        </button>
      </div>
      <div
        className="doc-toolbar"
        role="toolbar"
        aria-label="Document formatting"
      >
        <fieldset disabled={busy}>
          <legend className="sr-only">Document tools</legend>
          <button
            className="doc-tool"
            aria-label="Undo"
            disabled={!history.length}
            onClick={undo}
          >
            <Undo2 size={17} />
          </button>
          <button
            className="doc-tool"
            aria-label="Redo"
            disabled={!future.length}
            onClick={redo}
          >
            <Redo2 size={17} />
          </button>
          <span className="doc-divider" />
          <button
            className={`doc-tool ${mode === "edit" ? "active" : ""}`}
            aria-label="Edit existing text"
            aria-pressed={mode === "edit"}
            onClick={() => {
              setMode("edit");
              setDraft(null);
            }}
          >
            <MousePointer2 size={16} />
          </button>
          <button
            className="doc-tool doc-add-text"
            aria-label="Add text"
            onClick={() => beginText()}
          >
            <Type size={16} />
            <span>Text</span>
          </button>
          <button
            className={`doc-tool ${mode === "highlight" ? "active" : ""}`}
            aria-label="Highlight"
            aria-pressed={mode === "highlight"}
            onClick={() => {
              setMode(mode === "highlight" ? "edit" : "highlight");
              setDraft(null);
            }}
          >
            <Highlighter size={16} />
          </button>
          <span className="doc-divider" />
          <label className="sr-only" htmlFor="doc-font-family">
            Font family
          </label>
          <select
            id="doc-font-family"
            value={current.font_family || "sans-serif"}
            onChange={(event) =>
              applyFormat({
                font_family: event.target.value as Format["font_family"],
              })
            }
          >
            <option value="sans-serif">Arial</option>
            <option value="serif">Times</option>
            <option value="monospace">Courier</option>
          </select>
          <label className="sr-only" htmlFor="doc-font-size">
            Font size
          </label>
          <select
            id="doc-font-size"
            className="doc-font-size"
            value={current.font_size}
            onChange={(event) =>
              applyFormat({ font_size: Number(event.target.value) })
            }
          >
            {Array.from(
              new Set([
                8,
                10,
                12,
                14,
                16,
                18,
                20,
                24,
                28,
                32,
                36,
                48,
                72,
                Math.round(current.font_size * 10) / 10,
              ]),
            )
              .sort((a, b) => a - b)
              .map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
          </select>
          <button
            className={`doc-tool ${current.bold ? "active" : ""}`}
            aria-label="Bold"
            aria-pressed={!!current.bold}
            onClick={() => applyFormat({ bold: !current.bold })}
          >
            <Bold size={17} />
          </button>
          <button
            className={`doc-tool ${current.italic ? "active" : ""}`}
            aria-label="Italic"
            aria-pressed={!!current.italic}
            onClick={() => applyFormat({ italic: !current.italic })}
          >
            <Italic size={17} />
          </button>
          <button
            className={`doc-tool ${current.underline ? "active" : ""}`}
            aria-label="Underline"
            aria-pressed={!!current.underline}
            onClick={() => applyFormat({ underline: !current.underline })}
          >
            <Underline size={17} />
          </button>
          <label className="doc-color" title="Text color">
            <span className="sr-only">Text color</span>
            <input
              type="color"
              value={current.color}
              onChange={(event) => applyFormat({ color: event.target.value })}
            />
          </label>
          <span className="doc-divider" />
          {(
            [
              { value: "left", Icon: AlignLeft },
              { value: "center", Icon: AlignCenter },
              { value: "right", Icon: AlignRight },
            ] as const
          ).map((item) => (
            <button
              key={item.value}
              className={`doc-tool ${(current.align || "left") === item.value ? "active" : ""}`}
              aria-label={`Align ${item.value}`}
              aria-pressed={(current.align || "left") === item.value}
              onClick={() => applyFormat({ align: item.value })}
            >
              <item.Icon size={17} />
            </button>
          ))}
          <span className="doc-divider" />
          <label className="sr-only" htmlFor="doc-zoom">
            Zoom
          </label>
          <select
            id="doc-zoom"
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          >
            {[50, 75, 100, 125, 150].map((value) => (
              <option key={value} value={value}>
                {value}%
              </option>
            ))}
          </select>
        </fieldset>
      </div>
      {error && (
        <p role="alert" className="notice error doc-error">
          {error}
        </p>
      )}
      <div className="doc-layout">
        <aside className="doc-outline" aria-label="Document pages">
          <div className="doc-outline-title">
            Pages <span>{order.length}</span>
          </div>
          {order.map((page, index) => (
            <div
              className={`doc-outline-page ${page === selected ? "active" : ""}`}
              key={page}
            >
              <button
                className="doc-page-select"
                disabled={busy}
                aria-pressed={selected === page}
                onClick={() => selectPage(page)}
              >
                <span className="doc-mini-paper">
                  <FileText size={26} />
                </span>
                <span>Page {index + 1}</span>
              </button>
              <div className="doc-page-actions">
                <button
                  className="icon-button"
                  aria-label={`Move original page ${page + 1} up`}
                  disabled={busy || index === 0}
                  onClick={() => onMovePage(index, -1)}
                >
                  <ArrowUp size={13} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Move original page ${page + 1} down`}
                  disabled={busy || index === order.length - 1}
                  onClick={() => onMovePage(index, 1)}
                >
                  <ArrowDown size={13} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Delete original page ${page + 1}`}
                  disabled={busy || order.length === 1}
                  onClick={() => {
                    setDraft(null);
                    onRemovePage(page);
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </aside>
        <div className="doc-stage">
          <div className="doc-instructions">
            {mode === "highlight"
              ? "Drag across an area to highlight it."
              : "Click existing text to edit it, or choose Text to write on the page."}
          </div>
          <div
            className="doc-paper-holder"
            style={{ width: `calc(min(100%, 816px) * ${zoom / 100})` }}
          >
            <div className="doc-ruler" aria-hidden="true">
              {Array.from({ length: 9 }, (_, i) => (
                <span key={i}>{i + 1}</span>
              ))}
            </div>
            <DocumentPaper
              key={selected}
              document={document}
              page={selected}
              edits={edits.filter((edit) => edit.page === selected)}
              draft={draft?.page === selected ? draft : null}
              mode={mode}
              busy={busy}
              onBegin={openBlock}
              onDraft={commit}
              onAdd={beginText}
              onBlur={() => {}}
              onDimensions={onDimensions}
            />
          </div>
        </div>
      </div>
      <div className="doc-statusbar">
        <span>
          Page {order.indexOf(selected) + 1} of {order.length}
        </span>
        <span>PDF · Fixed page layout</span>
        {draft && (
          <div className="doc-box-actions">
            <span>Text box</span>
            <button
              className="doc-tool"
              aria-label="Make text box wider"
              disabled={busy}
              onClick={() => sizeBox(2, 0.1)}
            >
              <Plus size={13} />
              Width
            </button>
            <button
              className="doc-tool"
              aria-label="Make text box taller"
              disabled={busy}
              onClick={() => sizeBox(3, 0.05)}
            >
              <Plus size={13} />
              Height
            </button>
            <button
              className="doc-tool"
              aria-label="Make text box shorter"
              disabled={busy}
              onClick={() => sizeBox(3, -0.025)}
            >
              <Minus size={13} />
            </button>
            <button className="doc-tool" onClick={() => setDraft(null)}>
              Done
            </button>
          </div>
        )}
      </div>
      <p className="doc-layout-note">
        Type directly in text blocks. Fonts use standard equivalents. Text boxes
        grow as you type and do not push other paragraphs onto a new line or
        page. Scanned image text is not editable.
      </p>
    </div>
  );
}
