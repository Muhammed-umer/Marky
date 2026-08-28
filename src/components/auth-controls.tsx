"use client";

import { SignInButton, SignUpButton, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";

export function AuthControls() {
  return <div className="auth-controls"><SignedOut><SignInButton mode="modal"><button className="auth-link">Sign in</button></SignInButton><SignUpButton mode="modal"><button className="primary-button auth-button">Get started</button></SignUpButton></SignedOut><SignedIn><UserButton /></SignedIn></div>;
}
