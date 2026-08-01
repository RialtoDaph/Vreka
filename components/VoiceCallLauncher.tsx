"use client";

import { useEffect, useState } from "react";
import VoiceCallOverlay from "@/components/VoiceCallOverlay";

export default function VoiceCallLauncher() {
  const [open, setOpen] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported(
      typeof window.MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia
    );
  }, []);

  if (!supported) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full bg-panel/80 backdrop-blur-sm border border-cyan-glow/50 shadow-glow flex items-center justify-center text-cyan-glow text-2xl hover:bg-cyan-glow/10 transition-colors"
        aria-label="Ngobrol sama Aslan"
        title="Ngobrol sama Aslan"
      >
        ✦
      </button>
      {open && <VoiceCallOverlay onClose={() => setOpen(false)} />}
    </>
  );
}
