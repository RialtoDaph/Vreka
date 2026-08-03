"use client";

import dynamic from "next/dynamic";
import type { MemoryMapData } from "@/lib/memoryMap";
import type { MemoryMapVitals } from "./MemoryMap";

const MemoryMap = dynamic(() => import("./MemoryMap"), {
  ssr: false,
  loading: () => (
    <div className="h-dvh bg-void flex items-center justify-center">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-cyan-glow pulse-dot">
        Memuat memory core...
      </p>
    </div>
  ),
});

export default function MemoryMapLoader({
  data,
  vitals,
}: {
  data: MemoryMapData;
  vitals: MemoryMapVitals;
}) {
  return <MemoryMap data={data} vitals={vitals} />;
}
