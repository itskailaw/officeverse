"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;

/** Tab bar with a highlight that slides to the active tab. */
export const TabsList = ({ className, children, ...p }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) => {
  const ref = React.useRef<HTMLDivElement>(null);
  const [box, setBox] = React.useState<{ left: number; top: number; width: number; height: number } | null>(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const a = el.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
      setBox(a ? { left: a.offsetLeft, top: a.offsetTop, width: a.offsetWidth, height: a.offsetHeight } : null);
    };
    measure();
    const mo = new MutationObserver(measure);
    mo.observe(el, { attributes: true, subtree: true, attributeFilter: ["data-state"] });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      mo.disconnect();
      ro.disconnect();
    };
  }, []);
  return (
    <TabsPrimitive.List ref={ref} className={cn("relative inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1", className)} {...p}>
      {box && (
        <span
          aria-hidden
          className="pointer-events-none absolute z-0 rounded-md bg-panel shadow-sm transition-[left,top,width,height] duration-300 ease-[cubic-bezier(.3,1.3,.5,1)]"
          style={box}
        />
      )}
      {children}
    </TabsPrimitive.List>
  );
};

export const TabsTrigger = ({ className, ...p }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) => (
  <TabsPrimitive.Trigger
    className={cn(
      "relative z-10 inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors data-[state=active]:text-slate-900 [&_svg]:size-3.5",
      className,
    )}
    {...p}
  />
);

export const TabsContent = ({ className, ...p }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) => (
  <TabsPrimitive.Content className={cn("focus-visible:outline-none", className)} {...p} />
);
