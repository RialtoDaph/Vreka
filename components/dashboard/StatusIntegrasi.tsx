"use client";

import { useEffect, useState } from "react";
import HudPanel from "@/components/HudPanel";
import { ASSISTANT_MODELS, DEFAULT_ASSISTANT_MODEL, isValidAssistantModel } from "@/lib/assistant/models";

const MODEL_STORAGE_KEY = "vreka-assistant-model";

export default function StatusIntegrasi({
  gmailEmail,
  voiceEnabled,
}: {
  gmailEmail: string | null;
  voiceEnabled: boolean;
}) {
  const [model, setModel] = useState(DEFAULT_ASSISTANT_MODEL);

  useEffect(() => {
    const saved = window.localStorage.getItem(MODEL_STORAGE_KEY);
    if (isValidAssistantModel(saved)) setModel(saved);
  }, []);

  const modelLabel = ASSISTANT_MODELS.find((m) => m.id === model)?.label ?? model;

  const rows = [
    { label: "Model Aslan", value: modelLabel, ok: true },
    {
      label: "Gmail",
      value: gmailEmail ? `Terhubung (${gmailEmail})` : "Belum terhubung",
      ok: !!gmailEmail,
    },
    { label: "Voice (ElevenLabs)", value: voiceEnabled ? "Aktif" : "Nonaktif", ok: voiceEnabled },
  ];

  return (
    <HudPanel>
      <h3 className="font-display font-semibold text-white tracking-wide mb-3">
        Status Integrasi
      </h3>
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-slate-400">{r.label}</span>
            <span
              className={`flex items-center gap-1.5 font-mono text-xs truncate max-w-[65%] ${
                r.ok ? "text-mint-glow" : "text-slate-500"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${r.ok ? "bg-mint-glow" : "bg-slate-600"}`}
              />
              <span className="truncate">{r.value}</span>
            </span>
          </li>
        ))}
      </ul>
    </HudPanel>
  );
}
