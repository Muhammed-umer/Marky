"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="center-state"><p className="eyebrow">Something interrupted the feed</p><h1>Let’s try that again.</h1><p>Your saved links are untouched.</p><button onClick={reset} className="primary-button">Reload feed</button></main>;
}
