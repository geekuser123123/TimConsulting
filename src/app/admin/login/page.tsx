import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="container" style={{ maxWidth: 420 }}>
      <div className="card">
        <h1>Team sign in</h1>
        <LoginForm next={next ?? ""} />
      </div>
    </main>
  );
}
