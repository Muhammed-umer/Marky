"use client";

import { useUser, UserButton, SignInButton } from "@clerk/nextjs";
import Link from "next/link";

export function HeaderAuth() {
  const { isSignedIn, isLoaded } = useUser();

  if (!isLoaded) {
    return (
      <div className="flex items-center gap-4">
        <div className="w-20 h-8 bg-paper-secondary animate-pulse rounded" />
      </div>
    );
  }

  if (isSignedIn) {
    return (
      <div className="flex items-center gap-4">
        <UserButton
          appearance={{
            elements: {
              avatarBox: "w-9 h-9 border border-rule",
            },
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <SignInButton mode="modal">
        <button className="text-sm font-medium text-charcoal hover:text-vermillion transition-colors cursor-pointer">
          Sign In
        </button>
      </SignInButton>
      <Link
        href="/sign-up"
        className="bg-vermillion hover:bg-vermillion-hover text-white text-sm font-medium px-4 py-2 rounded-md transition-colors"
      >
        Get Started
      </Link>
    </div>
  );
}

export function HeroAuthCTA() {
  const { isSignedIn, isLoaded } = useUser();

  if (!isLoaded) {
    return (
      <div className="flex justify-center mb-16">
        <div className="w-36 h-12 bg-paper-secondary animate-pulse rounded-md" />
      </div>
    );
  }

  if (isSignedIn) {
    return (
      <div className="flex flex-wrap justify-center gap-4 mb-16">
        <Link
          href="/onboarding"
          className="inline-flex items-center gap-2 bg-vermillion hover:bg-vermillion-hover text-white font-medium px-6 py-3 rounded-md transition-colors shadow-sm"
        >
          Configure Interests &rarr;
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap justify-center gap-4 mb-16">
      <Link
        href="/sign-up"
        className="inline-flex items-center gap-2 bg-vermillion hover:bg-vermillion-hover text-white font-medium px-6 py-3 rounded-md transition-colors shadow-sm"
      >
        Start Reading &rarr;
      </Link>
    </div>
  );
}
