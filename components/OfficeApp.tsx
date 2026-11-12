"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useOffice } from "@/lib/store/office-store";
import { useUI } from "@/lib/store/ui-store";
import { useSimBridge } from "@/lib/office/useSimBridge";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";
import { ensureWorkspace, startSync } from "@/lib/data/sync";
import { Button } from "@/components/ui/button";
import { BuildPanel, CameraControls, HelpHint, NotificationsPanel, Toasts, Toolbar, TopBar } from "./hud/Chrome";
import { EmployeePanel } from "./hud/EmployeePanel";
import { ExecutiveDashboard } from "./hud/ExecutiveDashboard";
import { EmployeeEditor } from "./hud/EmployeeEditor";
import { MeetingCallDialog, MeetingPanel } from "./hud/Meeting";
import { SettingsDialog } from "./hud/SettingsDialog";
import { MobileDashboard } from "./hud/MobileDashboard";

const OfficeScene = dynamic(() => import("./office/OfficeScene"), {
  ssr: false,
  loading: () => <Loading text="Building your office…" />,
});

function Loading({ text }: { text: string }) {
  return (
    <div className="grid h-full w-full place-items-center bg-gradient-to-b from-slate-100 to-slate-200">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-navy/20 border-t-navy" />
        <div className="text-sm font-medium text-slate-600">{text}</div>
      </div>
    </div>
  );
}

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

type Phase = "booting" | "auth-required" | "ready" | "error";

export default function OfficeApp() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("booting");
  const [error, setError] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);
  const [force3D, setForce3D] = useState(false);
  const [gl, setGl] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const selected = useUI((s) => s.selectedEmployeeId);

  useSimBridge();

  useEffect(() => {
    setGl(webglAvailable());
    const mq = window.matchMedia("(max-width: 767px)");
    setMobile(mq.matches);
    const on = (e: MediaQueryListEvent) => setMobile(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // boot: wait for local persistence, then (optionally) connect Supabase
  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      if (!useOffice.persist.hasHydrated()) await new Promise<void>((r) => useOffice.persist.onFinishHydration(() => r()));
      const sb = getSupabase();
      if (!sb) return setPhase("ready");
      const { data } = await sb.auth.getSession();
      if (!data.session) {
        setPhase("auth-required");
        router.replace("/login");
        return;
      }
      setEmail(data.session.user.email ?? null);
      try {
        const ws = await ensureWorkspace(sb);
        if (cancelled) return;
        stop = await startSync(sb, ws);
        setPhase("ready");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [router]);

  if (phase === "booting" || phase === "auth-required") return <Loading text="Opening OfficeVerse…" />;
  if (phase === "error")
    return (
      <div className="grid h-full place-items-center bg-slate-100 p-6">
        <div className="max-w-md rounded-2xl bg-white p-6 text-center shadow">
          <div className="text-base font-semibold text-slate-900">Couldn&apos;t connect to your workspace</div>
          <p className="mt-2 text-sm text-slate-600">{error}</p>
          <p className="mt-2 text-xs text-slate-500">Check that the Supabase migration has been applied, then retry.</p>
          <Button className="mt-4" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      </div>
    );

  const authLabel = supabaseConfigured ? (
    <Button
      variant="ghost"
      size="icon"
      title={email ? `Signed in as ${email} — sign out` : "Sign out"}
      onClick={async () => {
        await getSupabase()?.auth.signOut();
        router.replace("/login");
      }}
    >
      <LogOut />
    </Button>
  ) : null;

  const dialogs = (
    <>
      <ExecutiveDashboard />
      <EmployeeEditor />
      <MeetingCallDialog />
      <SettingsDialog />
      <Toasts />
    </>
  );

  if ((mobile && !force3D) || !gl) {
    return (
      <>
        {!gl && <div className="bg-amber-100 px-4 py-2 text-center text-xs text-amber-900">WebGL is unavailable in this browser — showing the dashboard view.</div>}
        <MobileDashboard onOpen3D={() => (gl ? setForce3D(true) : undefined)} />
        {selected && (
          <div className="fixed inset-0 z-40">
            <EmployeePanel />
          </div>
        )}
        {dialogs}
      </>
    );
  }

  return (
    <main className="relative h-dvh w-full overflow-hidden select-none">
      <div className="absolute inset-0">
        <OfficeScene />
      </div>
      <div className="pointer-events-none absolute inset-0">
        <TopBar authLabel={authLabel} />
        <Toolbar />
        <NotificationsPanel />
        {selected && <EmployeePanel />}
        <MeetingPanel />
        <BuildPanel />
        <CameraControls />
        <HelpHint />
      </div>
      {dialogs}
    </main>
  );
}
