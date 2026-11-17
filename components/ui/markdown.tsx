"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/** Renders AI-written Markdown safely (no raw HTML) with compact office styling. */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div
      className={cn(
        "space-y-2 text-[13px] leading-relaxed text-slate-700 [&_a]:text-sky-700 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-amber-300 [&_blockquote]:pl-3 [&_blockquote]:text-slate-500 [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_h1]:text-sm [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:text-[13px] [&_h3]:font-semibold [&_li]:ml-4 [&_ol]:list-decimal [&_strong]:font-semibold [&_strong]:text-slate-900 [&_table]:w-full [&_table]:text-xs [&_td]:border-t [&_td]:border-slate-100 [&_td]:px-1.5 [&_td]:py-1 [&_th]:px-1.5 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold [&_ul]:list-disc",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow">
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
