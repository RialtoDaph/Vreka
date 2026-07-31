"use client";

import { useEffect, useState } from "react";
import HudPanel from "@/components/HudPanel";

export default function OverviewInsight() {
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/assistant/insight")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setInsight(data?.insight ?? null))
      .catch(() => setInsight(null))
      .finally(() => setLoading(false));
  }, []);

  if (!loading && !insight) return null;

  return (
    <HudPanel glow>
      <div className="flex items-start gap-3">
        <span className="text-cyan-glow text-lg leading-none mt-0.5">✦</span>
        <div className="min-w-0">
          <p className="text-[11px] font-mono uppercase tracking-wider text-cyan-glow mb-1">
            Insight
          </p>
          <p className="text-sm text-slate-200">
            {loading ? "Menganalisis kondisi kamu..." : insight}
          </p>
        </div>
      </div>
    </HudPanel>
  );
}
