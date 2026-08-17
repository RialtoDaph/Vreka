"use client";

import { useState } from "react";
import Markdown from "@/components/Markdown";
import { inputClass } from "@/lib/ui";

// Textarea with a Tulis/Pratinjau tab so markdown syntax (headers, lists,
// **bold**, links, ```code```, GFM task lists) can be checked before saving
// instead of only ever being visible as raw text while composing.
export default function MarkdownEditor({
  value,
  onChange,
  placeholder,
  minHeightClass = "min-h-24",
  textClass = "",
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeightClass?: string;
  textClass?: string;
  autoFocus?: boolean;
}) {
  const [tab, setTab] = useState<"write" | "preview">("write");

  return (
    <div>
      <div className="flex gap-1 mb-1.5">
        <button
          type="button"
          onClick={() => setTab("write")}
          className={`px-2 py-0.5 rounded-sm text-[10.5px] font-mono uppercase tracking-wider transition-colors ${
            tab === "write" ? "bg-cyan-glow/10 text-cyan-glow" : "text-slate-500 hover:text-slate-300"
          }`}
        >
          Tulis
        </button>
        <button
          type="button"
          onClick={() => setTab("preview")}
          className={`px-2 py-0.5 rounded-sm text-[10.5px] font-mono uppercase tracking-wider transition-colors ${
            tab === "preview" ? "bg-cyan-glow/10 text-cyan-glow" : "text-slate-500 hover:text-slate-300"
          }`}
        >
          Pratinjau
        </button>
      </div>
      {tab === "write" ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className={`${inputClass} ${minHeightClass} ${textClass}`}
        />
      ) : (
        <div className={`${inputClass} ${minHeightClass} ${textClass} overflow-y-auto`}>
          {value.trim() ? (
            <Markdown>{value}</Markdown>
          ) : (
            <p className="text-sm text-slate-600">Nggak ada isi buat dipratinjau.</p>
          )}
        </div>
      )}
    </div>
  );
}
