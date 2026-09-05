import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const clerkProxy = clerkMiddleware();

export default function proxy(...args: Parameters<typeof clerkProxy>) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true" || !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return NextResponse.next();
  }

  return clerkProxy(...args);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
