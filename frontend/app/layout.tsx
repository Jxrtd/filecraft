import type { Metadata } from "next";
import Link from "next/link";
import { Layers2, ArrowUpRight } from "lucide-react";
import Navigation from "@/components/Navigation";
import "./globals.css";
export const metadata: Metadata = {
  title: "FileCraft — A little less file friction",
  description:
    "Convert, edit, and combine PDFs, extract text, and remove backgrounds. Simple file tools, without an account.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <header className="site-header">
          <Link href="/" className="brand" aria-label="FileCraft home">
            <span className="brand-icon">
              <Layers2 size={23} />
            </span>
            FileCraft<span className="brand-dot">.</span>
          </Link>
          <Navigation />
          <span className="header-note">
            <span className="status-dot" /> No sign-up. Just get it done.
          </span>
        </header>
        <main id="main">{children}</main>
        <footer>
          <Link href="/" className="brand footer-brand">
            <Layers2 size={21} /> FileCraft.
          </Link>
          <p>Small tools. More possibilities.</p>
          <Link href="/pdf-converter">
            Make something useful <ArrowUpRight size={15} />
          </Link>
          <span>© {new Date().getFullYear()} FileCraft</span>
        </footer>
      </body>
    </html>
  );
}
