import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import "./wwt.css";
import { HeaderNav } from "./HeaderNav";

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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="brand-emblem" src="/brand/roth-academy-emblem.png" alt="" width={346} height={310} />
              <span className="brand-name">
                Roth Academy<span className="brand-sub">Work with Tim Berry</span>
              </span>
            </Link>
            <HeaderNav />
          </div>
        </header>
        <div className="site-main">{children}</div>
        <footer className="site-footer">
          <div className="inner">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="footer-logo" src="/brand/roth-academy-logo.png" alt="Roth Academy" width={464} height={503} />
            <span>Work With Tim Berry · Consulting requests reviewed before scheduling</span>
            <span>Submitting a request does not create an attorney-client relationship.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
