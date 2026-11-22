"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "info"; text: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sb = getSupabase();
    if (!sb) return;
    setBusy(true);
    setMsg(null);
    const res = mode === "signin" ? await sb.auth.signInWithPassword({ email, password }) : await sb.auth.signUp({ email, password });
    setBusy(false);
    if (res.error) return setMsg({ kind: "error", text: res.error.message });
    if (mode === "signup" && !res.data.session) return setMsg({ kind: "info", text: "Check your inbox to confirm your email, then sign in." });
    // a fresh sign-in always gets the "today at a glance" pop-up
    try {
      sessionStorage.removeItem("ov:welcome-seen");
    } catch {}
    router.replace("/office");
  };

  return (
    <div className="grid h-dvh place-items-center overflow-auto bg-gradient-to-br from-navy-dark via-navy to-slate-800 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-panel p-6 shadow-2xl">
        <div className="mb-5 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-192.png?v=2" alt="OfficeVerse" width={40} height={40} className="h-10 w-10" />
          <div>
            <div className="text-lg font-semibold text-slate-900">OfficeVerse</div>
            <div className="text-xs text-slate-500">Your Business. Your People. Your Universe.</div>
          </div>
        </div>
        {supabaseConfigured ? (
          <form onSubmit={submit} className="space-y-3">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="pw">Password</Label>
              <Input
                id="pw"
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                minLength={8}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {msg && <p className={`text-xs ${msg.kind === "error" ? "text-red-600" : "text-sky-700"}`}>{msg.text}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
            <button type="button" className="w-full text-center text-xs text-slate-500 hover:underline" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
              {mode === "signin" ? "New here? Create an account" : "Have an account? Sign in"}
            </button>
          </form>
        ) : (
          <div className="space-y-3 text-sm text-slate-600">
            <p>
              Supabase isn&apos;t configured, so OfficeVerse runs in <b>local mode</b>: everything is stored in this browser and business metrics only appear as
              labelled demo data.
            </p>
            <p className="text-xs text-slate-500">
              Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> to enable accounts, cloud sync and realtime.
            </p>
            <Button asChild className="w-full">
              <Link href="/office">Enter the office (local mode)</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
