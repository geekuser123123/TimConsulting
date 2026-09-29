"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Stripe's confirmation usually lands within seconds: re-check a few times, then stop. */
export function RefreshUntilConfirmed({ confirmed }: { confirmed: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (confirmed) return;
    const tries = Number(sessionStorage.getItem("pay-refresh") ?? "0");
    if (tries >= 6) return;
    const timer = setTimeout(() => {
      sessionStorage.setItem("pay-refresh", String(tries + 1));
      router.refresh();
    }, 2500);
    return () => clearTimeout(timer);
  }, [confirmed, router]);
  useEffect(() => {
    if (confirmed) sessionStorage.removeItem("pay-refresh");
  }, [confirmed]);
  return null;
}
