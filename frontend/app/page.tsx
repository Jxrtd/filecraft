import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  FileText,
  ScanText,
  Scissors,
  ShieldCheck,
  Sparkles,
  MousePointer2,
  Check,
  Layers2,
  PencilLine,
  Files,
  WandSparkles,
  Gauge,
} from "lucide-react";
const tools = [
  {
    href: "/text-humanizer",
    icon: WandSparkles,
    name: "Text Humanizer",
    text: "Turn stiff, overly formal paragraphs into clearer, more natural writing while keeping the original meaning.",
    formats: "PASTE TEXT · EDIT · DOWNLOAD",
    color: "peach",
    number: "06",
    action: "Humanize your text",
  },
  {
    href: "/ai-detector",
    icon: Gauge,
    name: "AI Text Detector",
    text: "Review writing patterns and get an experimental human-like versus AI-like percentage estimate.",
    formats: "PATTERN ESTIMATE · NO FALSE CERTAINTY",
    color: "lavender",
    number: "07",
    action: "Analyze some text",
  },
  {
    href: "/pdf-editor",
    icon: PencilLine,
    name: "PDF Editor",
    text: "Add text, replace a text area, highlight what matters, and put your pages in order. All inside your PDF.",
    formats: "TEXT · HIGHLIGHTS · PAGE EDITING",
    color: "lavender",
    number: "04",
    action: "Edit a PDF",
  },
  {
    href: "/merge-pdf",
    icon: Files,
    name: "Combine PDFs",
    text: "Bring separate PDFs into one document. Choose their order, combine every page, and download.",
    formats: "MULTIPLE PDF FILES → ONE PDF",
    color: "sage",
    number: "05",
    action: "Combine your PDFs",
  },
  {
    href: "/pdf-converter",
    icon: FileText,
    name: "PDF Converter",
    text: "Convert PDF to Word and back again. Bring images and Office files into the mix, too.",
    formats: "JPG · PNG · WORD · EXCEL · POWERPOINT",
    color: "peach",
    number: "01",
    action: "Convert a file",
  },
  {
    href: "/image-to-text",
    icon: ScanText,
    name: "Image to Text",
    text: "Skip the retyping. Turn the words in your images into text you can actually use.",
    formats: "JPG · PNG · WEBP → EDITABLE TEXT",
    color: "lavender",
    number: "02",
    action: "Extract text",
  },
  {
    href: "/remove-background",
    icon: Scissors,
    name: "Remove Background",
    text: "Keep the subject. Lose the background. Get a clean, transparent image in a few clicks.",
    formats: "JPG · PNG · WEBP → TRANSPARENT PNG",
    color: "sage",
    number: "03",
    action: "Remove a background",
  },
];
export default function Home() {
  return (
    <>
      <section className="hero page-width">
        <div className="eyebrow">
          <span className="tiny-star">✳</span> LESS BUSYWORK. MORE MAKING.
        </div>
        <h1>
          Your files.
          <br />A little more <span className="serif">possibility.</span>
          <span className="hero-spark">✳</span>
        </h1>
        <p>
          Convert, extract, and create with seven everyday tools.
          <br className="desktop-break" /> No accounts. No complicated steps.
          Just what you need.
        </p>
        <a className="button primary hero-button" href="#tools">
          Find your tool <ArrowRight size={17} />
        </a>
        <div className="hero-proof">
          <span>
            <Check size={14} /> Free to use
          </span>
          <span>
            <Check size={14} /> No sign-up
          </span>
          <span>
            <Check size={14} /> Files auto-deleted
          </span>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="art-orbit" />
          <div className="art-note note-back">
            <div className="note-tab" />
            <ScanText size={34} />
            <div className="art-lines">
              <i />
              <i />
              <i />
            </div>
            <span>Ideas, unlocked.</span>
          </div>
          <div className="art-note note-front">
            <div className="note-top">
              <Layers2 size={24} />
              <span>PDF</span>
            </div>
            <div className="art-landscape">
              <div className="art-sun" />
              <div className="hill hill-one" />
              <div className="hill hill-two" />
            </div>
            <div className="art-lines">
              <i />
              <i />
            </div>
            <div className="note-bottom">
              <span>Something good.</span>
              <Check size={17} />
            </div>
          </div>
          <div className="art-badge">
            <Sparkles size={23} />
          </div>
          <span className="art-plus">+</span>
          <span className="art-dot" />
        </div>
      </section>
      <section id="tools" className="tools-section page-width">
        <div className="section-heading">
          <div>
            <div className="eyebrow">YOUR EVERYDAY TOOLKIT</div>
            <h2>A good tool makes all the difference.</h2>
          </div>
          <span className="section-aside">
            Seven tools. Endless little wins. <ArrowUpRight size={18} />
          </span>
        </div>
        <div className="tool-grid">
          {tools.map((t) => (
            <Link className={`tool-card ${t.color}`} href={t.href} key={t.name}>
              <div className="card-top">
                <span className="tool-icon">
                  <t.icon size={27} strokeWidth={1.6} />
                </span>
                <span className="tool-number">/{t.number}</span>
              </div>
              <h3>{t.name}</h3>
              <p>{t.text}</p>
              <div className="formats">{t.formats}</div>
              <div className="card-action">
                {t.action}
                <span>
                  <ArrowUpRight size={20} />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>
      <section className="benefits page-width">
        <div className="benefit">
          <ShieldCheck size={23} />
          <div>
            <h3>Your files stay yours.</h3>
            <p>
              Temporary processing. Automatic cleanup.
              <br />
              No file library or account to worry about.
            </p>
          </div>
        </div>
        <div className="benefit">
          <MousePointer2 size={23} />
          <div>
            <h3>Less clicking. More doing.</h3>
            <p>
              Drop in a file, choose your settings,
              <br />
              and download something useful.
            </p>
          </div>
        </div>
        <div className="benefit">
          <Sparkles size={23} />
          <div>
            <h3>Made for the everyday.</h3>
            <p>
              That document, that screenshot, that photo.
              <br />A simpler way to get it done.
            </p>
          </div>
        </div>
      </section>
      <section className="closing page-width">
        <span className="tiny-star">✳</span>
        <p>A little less file friction. A little more flow.</p>
        <span>THAT’S FILECRAFT.</span>
      </section>
    </>
  );
}
