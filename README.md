# FileCraft

A responsive Next.js / TypeScript / Tailwind frontend and Python FastAPI backend. No accounts, authentication, database, or saved file library.

- **PDF Converter:** reorder JPG/PNG images into a PDF; choose A4, Letter, or image-sized pages. Convert DOC/DOCX, XLS/XLSX, and PPT/PPTX using LibreOffice. Render PDF pages at 144 DPI to PNG or JPG, preview the first six pages, and download every page in a ZIP. Convert text-based PDFs into editable Word DOCX using pdf2docx, and convert DOC/DOCX back to PDF using LibreOffice. PDF-to-Excel is not implemented.
- **PDF Editor:** a document-style workspace with a page sidebar, paper view, ruler, zoom, and formatting toolbar. Click existing text to type directly on the page; insert new text and drag highlights. Choose font family/size/color, bold, italic, underline, and alignment; undo/redo edits and use Ctrl/Cmd+S to save. Text boxes grow while typing. Editing stays in PDF format with original filenames, page reorder/delete, and desktop/mobile previews. PDF pages have a fixed layout: text does not reflow neighboring paragraphs or create new pages. Fonts use standard equivalents; scanned image text is not editable. Original text is removed only within the original text block, even when its replacement box grows. Pending redactions must be resolved before using replacement on that page. Up to 100 edited blocks/highlights per request; text that cannot fit on the page returns a clear error.
- **Combine PDFs:** order two or more PDFs and merge their pages directly with PyMuPDF, preserving images, annotations, and form widgets. The combined page count must fit `MAX_PAGES`. The first file in the selected order supplies the download filename.
- **Image to Text:** English Tesseract OCR for JPG, PNG, and WebP. Edit text, copy it, or download UTF-8 TXT; a blank result explains that no readable text was found.
- **Remove Background:** real rembg/u2netp processing with original/result comparison, a transparency checkerboard, and transparent PNG download.
- Drag and drop or browse, file details, reset/removal, keyboard image reordering, loading states, accessible labels, reduced-motion support, real errors, and working download links. Processing uses an indeterminate spinner, never invented progress percentages.

Downloads keep the uploaded file's base name and change only its extension (for example, `Report.pdf` becomes `Report.docx`). OCR TXT and transparent PNG downloads follow the same rule. A combined image PDF uses the first image in the selected page order; rendered PDF pages download in a ZIP named after the source PDF. Unsafe path/control characters are removed or replaced in download names; internal temporary files continue to use generated names.

## Docker (recommended)

Install Docker Engine with Compose v2, or Docker Desktop with Linux containers. From this directory:

```sh
cp .env.example .env
# PowerShell alternative: Copy-Item .env.example .env
docker compose up --build
```

Open **http://localhost:3000**. API documentation: **http://localhost:8000/api/docs**. The backend port is bound to loopback; the frontend proxies `/api` to the backend over the Compose network. No separate public API URL is needed. The frontend proxy target is set during the image build. Rebuild the frontend if that target changes.

The backend image installs LibreOffice Writer/Calc/Impress, Tesseract with English data, DejaVu/Liberation fonts, and native image dependencies. Both services run as non-root users. The backend is limited to two CPUs, 3 GB RAM, 128 processes, and a 1 GB temporary filesystem. Adjust these for your load. Documents using fonts not installed on the server can render differently.

Optional model warm-up before accepting background-removal requests:

```sh
docker compose run --rm backend python -c "from rembg import new_session; new_session('u2netp')"
```

To run the test suite with the real system dependencies inside the image:

```sh
docker compose run --rm -v "./backend/tests:/app/tests:ro" -e RUN_REMBG_TEST=1 backend python -m pytest /app/tests -q
```

Normal shutdown: `docker compose down`. This preserves the model cache. `docker compose down -v` also deletes the downloaded model cache; it will download again when needed.

## Local development

Requirements: Node.js 22.13+ (Node 24 recommended), Python 3.12, and the system tools below. Python 3.12 is the Docker/tested target; rembg/ONNX wheel availability varies with Python version and operating system.

Debian/Ubuntu system packages:

```sh
sudo apt-get update
sudo apt-get install libreoffice-writer libreoffice-calc libreoffice-impress tesseract-ocr tesseract-ocr-eng libglib2.0-0 libgl1 fonts-dejavu fonts-liberation
```

On macOS, install LibreOffice and Tesseract using Homebrew (`brew install --cask libreoffice`, `brew install tesseract`), and put `soffice` on PATH or set `LIBREOFFICE_BINARY=/Applications/LibreOffice.app/Contents/MacOS/soffice`. On Windows, install LibreOffice and a Tesseract distribution with English language data. The backend detects LibreOffice at its standard Windows install location or in this checkout's `.runtime/libreoffice-local/program` cache, preferring `soffice.com` for console conversions. This workspace has a working local LibreOffice copy extracted from the official checksum-verified MSI; the cache is ignored by source control and is not shipped with the source. Docker installs its own Linux copy. Otherwise add the executable folders to PATH, or export `LIBREOFFICE_BINARY` and `TESSERACT_BINARY` with full executable paths. Python dependencies alone do not install these applications. Docker avoids host-specific installation.

Backend, from `backend/`:

```sh
python3.12 -m venv .venv
source .venv/bin/activate
# Windows: py -3.12 -m venv .venv
# Windows: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1 --no-proxy-headers --no-access-log
```

Frontend, in a second terminal, from `frontend/`:

```sh
npm ci
npm run dev
```

Open http://localhost:3000. The default local proxy points at http://localhost:8000. For another backend, set `API_INTERNAL_URL` in `frontend/.env.local` and restart/rebuild Next.js. To call a separate API origin directly, set `NEXT_PUBLIC_API_URL` as well, then include the frontend origin in backend `CORS_ORIGINS`. Public variables are embedded at build time. The supplied proxy accepts up to 65 MB; increase `experimental.proxyClientMaxBodySize` and rebuild if raising the backend request limit above 64 MB.

### PDF and Word conversion

Choose **PDF to Word** or **Word to PDF** on the PDF Converter page.

- PDF to Word produces a real editable `.docx`, using [pdf2docx's layout-aware converter](https://pdf2docx.readthedocs.io/en/latest/quickstart.convert.html). It needs no LibreOffice installation for this direction. Fonts, complex columns, tables, drawings, and page breaks may differ from the original; inspect the downloaded document before sharing it.
- Image-only/scanned PDFs have no selectable text and are rejected with an OCR explanation. Export their pages as images and use Image to Text instead. In mixed text/scan documents, embedded images remain images; this conversion does not apply OCR.
- Word to PDF accepts `.doc` and `.docx` and requires LibreOffice. Excel/PowerPoint conversion remains available separately.
- Both directions use the same file/page limits, disposable workers, processing timeout, generated filenames, and cleanup mechanism as the other tools. The Word result panel previews the **original PDF**, since browsers do not natively render DOCX; download the actual result to open/edit it in Word or LibreOffice.

### Backend configuration

Docker Compose reads `.env`. For local uvicorn, export variables in your shell (or supply `--env-file ../.env`); FastAPI does not automatically load the root `.env` file.

| Variable | Default | Meaning |
| --- | --- | --- |
| `MAX_FILE_MB` | 20 | Per-file size, including files with misleading MIME headers |
| `MAX_REQUEST_MB` | 64 | Entire POST body, including multipart overhead; also enforced for chunked requests |
| `MAX_FILES` | 20 | Images per PDF request; all other operations accept one file |
| `MAX_PAGES` | 100 | Maximum source PDF pages |
| `MAX_IMAGE_PIXELS` | 25000000 | Decoded image size / individual PDF render size |
| `MAX_RENDER_PIXELS` | 100000000 | Total decoded pixels across rendered PDF pages |
| `MAX_CONCURRENT_JOBS` | 2 | Active POST requests, including upload and download; excess returns 429 |
| `REQUESTS_PER_MINUTE` | 20 | Per-client IP POST requests; excess returns 429 |
| `PROCESSING_TIMEOUT_SECONDS` | 180 | Worker deadline, including model setup; returns 504 on timeout |
| `TEMP_RETENTION_SECONDS` | 900 | Abandoned request directory age; minimum worker timeout + 60 seconds |
| `TEMP_ROOT` | `/tmp/filecraft` (Windows: `.runtime`) | Dedicated generated job directory root |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated allowed browser origins |
| `LIBREOFFICE_BINARY` | `soffice` | LibreOffice executable path |
| `TESSERACT_BINARY` | `tesseract` | Optional Tesseract executable path |
| `U2NET_HOME` | rembg default `~/.u2net` | Writable model cache directory |

Keep **one uvicorn worker**: limits and the active-job set are intentionally process-local. Each request launches an independent disposable Python processing process. Worker deadlines terminate the process tree, including LibreOffice. LibreOffice gets a unique profile per request so concurrent conversions do not share its global profile lock. No shell invocation or client-controlled output paths are used.

Behind Next.js, clients share the proxy IP rate-limit bucket. Use a trusted reverse proxy with appropriate per-client rate limits for a public deployment. Do not blindly trust arbitrary forwarded headers. Add TLS, upstream request/body timeouts and body-size limits; allow enough response time for the configured worker timeout. A single server with bounded concurrency is the supported deployment; horizontal scaling needs coordination beyond this database-free app.

### Model download and cache

`rembg` downloads its **u2netp ONNX model** on the first background-removal request, using its model downloader/checksum verification. The first request needs outbound HTTPS and can take longer. Set `U2NET_HOME` to a writable cache directory. In Docker it is `/home/filecraft/.u2net`, backed by the named `rembg_models` volume. Subsequent requests reuse the cached file while loading a fresh inference session inside each disposable worker. Prewarm with the command above to avoid concurrent first-download requests. In an offline deployment, prepopulate that volume/cache using the same rembg model/version before disabling internet access. Cache files contain model weights, never uploads.

### Actual file retention

Each request writes uploaded bytes under generated random filenames inside a unique temporary directory. Extension and content validation run before processing: Pillow checks image format/dimensions, PyMuPDF checks PDF structure/encryption/page limits, ZIP/XML checks inspect modern Office containers, and OLE streams identify legacy Office files. Client MIME headers and names are not trusted.

OCR inputs/results are deleted before the JSON response returns. Binary inputs/results are deleted in the response's `finally` block after the server sends the response, including interrupted downloads. Failed/timed-out jobs are deleted immediately. A janitor runs at startup and every 60 seconds, removing inactive directories older than the retention threshold (normally within 16 minutes). Active jobs/downloads are excluded until they finish. A killed server may leave files until restart; the janitor cannot run while the server is down. Docker's `/tmp` is memory-backed and discarded when the container stops. Multipart parser spool files are closed with the request; on a process crash, host-system temporary-file policies apply outside Docker. Use a dedicated OS temp location or Docker tmpfs when strict crash retention matters.

Binary responses use `Cache-Control: no-store`; OCR responses do too. Previews and download blobs live in browser tab memory until reset, page departure, or closing the tab. Downloaded files remain on the visitor's device. FileCraft has no durable upload storage. The application never logs file contents; worker stdout/stderr are discarded, and user-facing errors omit stack traces and internal paths. Infrastructure logging policies are controlled by the operator.

## Verification

```sh
cd frontend
npm run lint
npm run typecheck
npm run build
npx prettier --check app components lib *.ts *.mjs *.json

cd ../backend
ruff check app tests
ruff format --check app tests
pytest -q
# Also exercise actual rembg inference (may download a model):
RUN_REMBG_TEST=1 pytest -q
# PowerShell: $env:RUN_REMBG_TEST='1'; .venv/Scripts/python.exe -m pytest -q
```

Tests exercise real image-to-PDF output/order/page sizing, PNG/JPG PDF rendering and ZIP contents, content/extension mismatch, empty files, malformed Office files, upload limits, PDF page/pixel limits, worker timeout, rate/capacity rejection, CORS, and abandoned-file cleanup. Every endpoint test asserts that request directories were removed. Tesseract and LibreOffice integration tests skip when those executables are unavailable. The real rembg test runs only when `RUN_REMBG_TEST=1` is set. No processing implementation is mocked.

Environment verification: see `VERIFICATION.md` for actual commands/results and remaining host limitations.

## Source layout

```text
frontend/app/                 Home and tool routes; global styling
frontend/components/         Navigation and interactive upload/results workspace
frontend/lib/                Tool definitions and API configuration
backend/app/main.py          FastAPI lifecycle, CORS, and sanitized errors
backend/app/routes/          Upload endpoints, responses, download cleanup
backend/app/services/        File validation and disposable processing worker
backend/app/core/            Configuration, admission limits, jobs, janitor
backend/tests/               Validation and real processing endpoint tests
```

API: `GET /api/health`, `GET /api/config`; POST multipart `files` to `/api/images-pdf`, `/api/office-pdf`, `/api/pdf-images`, `/api/ocr`, `/api/remove-background`, `/api/pdf-word`, `/api/word-pdf`, `/api/pdf-edit`, or `/api/pdf-merge`. Optional `page_size` is `a4`, `letter`, or `original`; `image_format` is `png` or `jpg`. Output is PDF for images/Office/Word to PDF, ZIP for PDF pages, JSON `{text: string}` for OCR, PNG for background removal, or DOCX for PDF to Word. The API documentation at `/api/docs` describes request URLs; multipart inputs are described here because routes share one request handler.


### PDF editor / merger API

`POST /api/pdf-merge`: upload at least two PDFs using repeated multipart `files` fields, in desired output order. The shared file-count, upload-size, processing-timeout, request-rate, and temporary-directory cleanup limits apply.

`POST /api/pdf-edit`: upload one PDF in `files`, plus `pages` (JSON array of original zero-based page indexes in output order, excluding deleted pages) and `edits` (JSON array, maximum 100). An edit contains `page` (original zero-based index), `kind` (`text`, `replace`, or `highlight`), and `rect` (`[left, top, right, bottom]` normalized to 0–1 in the displayed original page orientation). Text edits also use `text`, optional `font_size` (6–72 pt), `font_family` (`sans-serif`, `serif`, or `monospace`), `bold`, `italic`, `underline`, `align` (`left`, `center`, or `right`), and `color` (`#RRGGBB`). Replacement edits may supply a separate normalized `source_rect` for removing original glyphs without deleting neighboring text when the output box grows. An empty replacement text deletes the original text block. The backend validates all metadata and returns a modified PDF. Only retained pages may have edits, and at least one page must remain. Original page orientation is handled using PyMuPDF's derotation matrix.

PDF.js worker, character maps, fonts, and WASM assets are copied from the pinned npm package by `predev`/`prebuild` into ignored `frontend/public/pdf-assets/`. Docker copies these generated public assets into its runtime image. No external CDN or document upload is needed for browser previews; saving/merging uses the real backend.

Browser tests (run while the frontend/backend are running):

```sh
cd frontend
npm run test:e2e
```

On Windows, tests use installed Microsoft Edge in headless mode. On other systems run `npx playwright install chromium` first. `FILECRAFT_BASE_URL` can point tests to another running deployment. Tests exercise real editor/merger API calls, text-area replacement, page removal, ordering, retained filenames, pointer selection, mobile layout, and rendered PDF previews; they do not mock processing. Screenshot output and browser artifacts are ignored by Git.
