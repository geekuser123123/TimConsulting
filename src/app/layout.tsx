import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import "./wwt.css";

export const metadata: Metadata = {
  title: { default: "Work With Tim Berry | Roth Academy", template: "%s | Roth Academy" },
  description: "Request a discovery call with Tim Berry for a matter that may require attorney-level work. Requests are reviewed before scheduling.",
};

export const viewport = { themeColor: "#0d363a" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <header className="site-header">
          <div className="inner">
            <Link href="/work-with-tim" className="brand" aria-label="Roth Academy, Work with Tim Berry">
              <span className="brand-mark" aria-hidden="true">
                R
              </span>
              <span className="brand-name">
                Roth Academy<span className="brand-sub">Work with Tim Berry</span>
              </span>
            </Link>
            <nav className="header-nav" aria-label="Page navigation">
              <Link href="/work-with-tim#about">About the call</Link>
              <Link href="/work-with-tim#process">How it works</Link>
              <Link href="/work-with-tim#questions">Questions</Link>
              <Link className="btn btn-primary" href="/work-with-tim#request">
                Request a Call <span aria-hidden="true">↗</span>
              </Link>
            </nav>
          </div>
        </header>
        {children}
        <footer className="site-footer">
          <div className="inner">
            <strong>Roth Academy</strong>
            <span>Work With Tim Berry · Consulting requests reviewed before scheduling</span>
            <span>Submitting a request does not create an attorney-client relationship.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
