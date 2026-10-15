import { NextResponse, type NextRequest } from "next/server";
import { qlooImageOrNull } from "@memory-lane/shared";

/**
 * The image optimizer's public endpoint takes only Qloo's own picture URLs, exactly as the app uses them
 * (no fragment, user, query or other variants), so it can't be used to fill the free optimizer quota with
 * endless copies of one picture (security review W1). Everything else passes untouched.
 */
export function proxy(request: NextRequest) {
  if (!qlooImageOrNull(request.nextUrl.searchParams.get("url"))) {
    return new NextResponse("Not a Qloo picture.", { status: 400 });
  }
  return NextResponse.next();
}

export const config = { matcher: "/_next/image" };
