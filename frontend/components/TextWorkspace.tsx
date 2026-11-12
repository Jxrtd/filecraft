"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Copy,
  Check,
  Download,
  LoaderCircle,
  Sparkles,
} from "lucide-react";
import { apiBase, tools } from "@/lib/tools";

type TextSlug = "text-humanizer" | "ai-detector";
type Detection = {
  ai_percentage: number;
  human_percentage: number;
  confidence: string;
  word_count: number;
  signals: string[];
};

export default function TextWorkspace({ slug }: { slug: TextSlug }) {
  const humanizer = slug === "text-humanizer";
  const tool = tools[slug];
  const [text, setText] = useState("");
  const [output, setOutput] = useState("");
  const [detection, setDetection] = useState<Detection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const maxChars = 20000;

  async function processText() {
    const clean = text.trim();
    if (!clean) {
      setError("Enter a paragraph first.");
      return;
    }
    setBusy(true);
    setError("");
    setOutput("");
    setDetection(null);
    try {
      const response = await fetch(
        `${apiBase}/api/${humanizer ? "humanize-text" : "detect-ai-text"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: clean }),
        },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok)
        throw Error(data?.detail || `Processing failed (${response.status}).`);
      if (humanizer) setOutput(data.text);
      else setDetection(data);
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message !== "Failed to fetch"
          ? caught.message
          : "Could not reach the processing server. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyOutput() {
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError(
        "Clipboard access is unavailable. Select and copy the text manually.",
      );
    }
  }

  function downloadOutput() {
    const url = URL.createObjectURL(
      new Blob([output], { type: "text/plain;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "humanized-text.txt";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className={`workspace page-width ${tool.color}`}>
      <Link className="back-link" href="/">
        <ArrowLeft size={16} /> All tools
      </Link>
      <div className="workspace-heading">
        <div className="eyebrow">WRITE WITH A LITTLE MORE CLARITY</div>
        <h1>
          {tool.name}
          <span>.</span>
        </h1>
        <p>{tool.description}</p>
      </div>
      <section className="text-tool" aria-label={tool.name}>
        <div className="text-tool-input">
          <div className="panel-title">
            <span className="step-number">01</span>
            <h2>{tool.intro}</h2>
          </div>
          <label htmlFor="source-text">Your paragraph</label>
          <textarea
            id="source-text"
            value={text}
            maxLength={maxChars}
            disabled={busy}
            onChange={(event) => {
              setText(event.target.value);
              setError("");
            }}
            placeholder={
              humanizer
                ? "Paste formal or robotic-sounding writing here…"
                : "Paste the text you want to examine…"
            }
          />
          <div className="text-count">
            {text.length.toLocaleString()} / {maxChars.toLocaleString()}{" "}
            characters
          </div>
          <button
            className="button primary text-process"
            disabled={busy || !text.trim()}
            onClick={processText}
          >
            {busy ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <Sparkles size={17} />
            )}
            {busy
              ? "Working…"
              : humanizer
                ? "Humanize text"
                : "Analyze writing"}
          </button>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
        </div>

        <div className="text-tool-result" aria-live="polite">
          <div className="panel-title">
            <span className="step-number">02</span>
            <h2>
              {humanizer
                ? "Your revised paragraph"
                : "Writing-pattern estimate"}
            </h2>
          </div>
          {humanizer && output ? (
            <>
              <textarea
                aria-label="Humanized text"
                value={output}
                onChange={(event) => setOutput(event.target.value)}
              />
              <div className="text-actions">
                <button className="button secondary" onClick={copyOutput}>
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {copied ? "Copied" : "Copy text"}
                </button>
                <button className="button secondary" onClick={downloadOutput}>
                  <Download size={16} /> Download TXT
                </button>
              </div>
            </>
          ) : detection ? (
            <div className="detection-result">
              <div className="score-grid">
                <div>
                  <strong>{detection.human_percentage}%</strong>
                  <span>Human-like patterns</span>
                </div>
                <div>
                  <strong>{detection.ai_percentage}%</strong>
                  <span>AI-like patterns</span>
                </div>
              </div>
              <div
                className="score-bar"
                aria-label={`${detection.human_percentage}% human-like and ${detection.ai_percentage}% AI-like`}
              >
                <i style={{ width: `${detection.human_percentage}%` }} />
              </div>
              <p>
                <strong>{detection.confidence} confidence</strong> based on{" "}
                {detection.word_count} words.
              </p>
              <ul>
                {detection.signals.map((signal) => (
                  <li key={signal}>{signal}</li>
                ))}
              </ul>
              <div className="detector-note">
                This is a writing-pattern estimate, not proof of who or what
                wrote the text. Short text is especially unreliable.
              </div>
            </div>
          ) : (
            <div className="text-empty">
              <Sparkles size={25} />
              <p>Your result will appear here.</p>
            </div>
          )}
        </div>
      </section>
      <p className="retention-note">
        Text is processed for this request only. FileCraft does not save it in
        an account or database.
      </p>
    </div>
  );
}
