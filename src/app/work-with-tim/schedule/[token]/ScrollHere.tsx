"use client";

import { useEffect, useRef } from "react";

/** Brings its parent into view on load, e.g. the confirmation right after the client clicks Book. */
export function ScrollHere() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const target = ref.current?.parentElement;
    if (!target) return;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
  }, []);
  return <span ref={ref} hidden />;
}
