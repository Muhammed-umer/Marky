"use client";

import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";

export function AuthControls() {
  return <div className="auth-controls"><Show when="signed-out"><SignInButton mode="modal"><button className="auth-link">Sign in</button></SignInButton><SignUpButton mode="modal"><button className="primary-button auth-button">Get started</button></SignUpButton></Show><Show when="signed-in"><UserButton /></Show></div>;
}
