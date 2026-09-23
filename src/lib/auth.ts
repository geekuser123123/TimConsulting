import "server-only";
import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { config } from "./config";
import { readSession, SESSION_COOKIE, sessionSecret, type Role } from "./session";

export async function currentRole(): Promise<Role | null> {
  const jar = await cookies();
  return readSession(jar.get(SESSION_COOKIE)?.value, sessionSecret());
}

/** Defense in depth: server actions re-check the role even though middleware gates the pages. */
export async function requireRole(...roles: Role[]): Promise<Role> {
  const role = await currentRole();
  if (!role || !roles.includes(role)) throw new Error("Not authorized");
  return role;
}

function eq(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function roleForPassword(password: string): Role | null {
  const tim = config.auth.timPassword;
  const staff = config.auth.staffPassword;
  if (tim && eq(password, tim)) return "tim";
  if (staff && eq(password, staff)) return "staff";
  return null;
}

export function actorFor(role: Role) {
  return role === "tim" ? ("tim" as const) : ("staff" as const);
}
