import { NextResponse, type NextRequest } from "next/server";
import { readSession, SESSION_COOKIE, sessionSecret } from "./lib/session";

/** Role-gate the internal dashboards. Tim's dashboards are Tim-only; the staff console is staff + Tim. */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/admin/login") return NextResponse.next();

  const role = await readSession(req.cookies.get(SESSION_COOKIE)?.value, sessionSecret());
  const needsTim = pathname.startsWith("/admin/tim");
  if (!role || (needsTim && role !== "tim")) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*"] };
