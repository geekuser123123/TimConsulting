"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Public navigation. Hidden on Tim's and staff's internal pages. */
export function HeaderNav() {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return null;
  return (
    <nav className="header-nav" aria-label="Page navigation">
      <Link href="/work-with-tim#about">About the call</Link>
      <Link href="/work-with-tim#process">How it works</Link>
      <Link href="/work-with-tim#questions">Questions</Link>
      <Link className="btn btn-primary" href="/work-with-tim#request">
        Request a Call <span aria-hidden="true">↗</span>
      </Link>
    </nav>
  );
}
