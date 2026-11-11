"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
export default function Navigation() {
  const path = usePathname();
  return (
    <nav aria-label="Main navigation">
      {[
        ["/", "All tools"],
        ["/pdf-converter", "PDF Converter"],
        ["/pdf-editor", "PDF Editor"],
        ["/merge-pdf", "Combine PDFs"],
        ["/image-to-text", "Image to Text"],
        ["/remove-background", "Remove Background"],
      ].map(([href, label]) => (
        <Link
          key={href}
          href={href}
          aria-current={path === href ? "page" : undefined}
          className={path === href ? "active" : ""}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
