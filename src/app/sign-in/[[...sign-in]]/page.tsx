import { SignIn } from "@clerk/nextjs";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  return (
    <main className="min-h-screen bg-paper flex flex-col items-center justify-center p-6">
      <div className="mb-8 text-center">
        <h1 className="font-serif text-3xl font-semibold text-charcoal mb-2">Marky</h1>
        <p className="text-charcoal-muted text-sm max-w-sm">
          Sign in to your editorial reading space.
        </p>
      </div>
      <SignIn
        appearance={{
          elements: {
            card: "bg-white border border-rule shadow-sm rounded-lg",
            headerTitle: "font-serif text-xl text-charcoal",
            formButtonPrimary: "bg-vermillion hover:bg-vermillion-hover text-white rounded-md transition-colors",
            footerActionLink: "text-vermillion hover:underline",
          },
        }}
      />
    </main>
  );
}
