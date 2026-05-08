import { auth } from "@/auth";
import { NextResponse } from "next/server";

const PUBLIC_ROUTES = ["/login", "/api/auth", "/api/health"];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (PUBLIC_ROUTES.some((r) => pathname.startsWith(r))) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/cron")) {
    const secret = req.headers.get("x-cron-secret");
    if (secret !== process.env.CRON_SECRET) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    return NextResponse.next();
  }

  if (!req.auth) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
