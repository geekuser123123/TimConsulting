import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Work With Tim Berry", template: "%s | Tim Berry" },
  description: "Request a discovery call with attorney Tim Berry.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="inner">
            <Link href="/work-with-tim" className="brand">
              Tim Berry
              <small>Roth Academy · Work With Tim</small>
            </Link>
          </div>
        </header>
        {children}
        <footer className="site-footer">
          Submitting a request or viewing this site does not create an attorney-client relationship.
        </footer>
      </body>
    </html>
  );
}
