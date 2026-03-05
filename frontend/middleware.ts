export { auth as middleware } from "@/lib/auth";

export const config = {
  matcher: [
    // Protect all app routes except auth, api, static files, and landing
    "/((?!api|_next/static|_next/image|favicon.ico|login|signup|$).*)",
  ],
};
