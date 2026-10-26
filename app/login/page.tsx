"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const password = new FormData(e.currentTarget).get("password");
    const res = await fetch("/api/login", { method: "POST", body: JSON.stringify({ password }) });
    setBusy(false);
    if (res.ok) router.replace("/");
    else setError(res.status === 401 ? "Wrong password." : "Login failed. Try again.");
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-xl font-semibold">Elevate Edge · Content suggestions</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <Label htmlFor="password">Dashboard password</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required autoFocus />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </main>
  );
}
