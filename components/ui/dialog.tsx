"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowLeft, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { growOrigin } from "@/lib/motion";

/** Grow the window out of the button that opened it (the centre otherwise). */
function setOrigin(el: HTMLElement | null) {
  if (!el) return;
  const o = growOrigin();
  if (!o) {
    el.style.transformOrigin = "";
    return;
  }
  const left = window.innerWidth / 2 - el.offsetWidth / 2;
  const top = window.innerHeight / 2 - el.offsetHeight / 2;
  el.style.transformOrigin = `${Math.round(o.x - left)}px ${Math.round(o.y - top)}px`;
}

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  title,
  description,
  onBack,
  backLabel = "Back",
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { title: React.ReactNode; description?: React.ReactNode; onBack?: () => void; backLabel?: string }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="ov-overlay fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-[2px]" />
      <DialogPrimitive.Content
        ref={setOrigin}
        className={cn(
          "ov-dialog fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-panel shadow-2xl",
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          {onBack && (
            <button
              onClick={onBack}
              className="-ml-1 flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              aria-label={backLabel}
            >
              <ArrowLeft className="h-4 w-4" /> {backLabel}
            </button>
          )}
          <div className="mr-auto">
            <DialogPrimitive.Title className="text-base font-semibold text-slate-900">{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-0.5 text-xs text-slate-500">{description}</DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">{typeof title === "string" ? title : "Dialog"}</DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
