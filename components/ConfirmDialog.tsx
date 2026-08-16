"use client";

import { useEffect, useRef } from "react";
import HudPanel from "@/components/HudPanel";
import { ghostBtnClass, primaryBtnClass, dangerPrimaryBtnClass } from "@/lib/ui";

export type ConfirmTone = "danger" | "default";

export type ConfirmDialogProps = {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  onConfirm: () => void;
  onCancel: () => void;
};

// Themed stand-in for window.confirm() -- same "are you sure" job, but a
// dialog that matches the rest of the app instead of the browser chrome.
// Usually rendered via the useConfirm() hook rather than directly.
export default function ConfirmDialog({
  message,
  confirmLabel = "Ya, lanjut",
  cancelLabel = "Batal",
  tone = "danger",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // Same pattern as CommandPalette: remember what had focus so it can be
    // restored on close, and land initial focus on the (safer) cancel-ish
    // side isn't needed here since the confirm button is what a keyboard
    // user pressing Enter right away would expect for a modal that just
    // took over the screen.
    triggerRef.current = document.activeElement as HTMLElement | null;
    const id = requestAnimationFrame(() => confirmRef.current?.focus());
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("keydown", onKeyDown);
      triggerRef.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleDialogKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Tab") return;
    const container = dialogRef.current;
    if (!container) return;
    const focusables = container.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])');
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-void/80 backdrop-blur-sm flex items-center justify-center px-4"
      onClick={onCancel}
    >
      <HudPanel
        as="div"
        glow
        className="w-full max-w-sm"
      >
        <div
          ref={dialogRef}
          role="alertdialog"
          aria-modal="true"
          aria-label="Konfirmasi"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={handleDialogKeyDown}
        >
          <p className="text-sm text-slate-200 leading-relaxed mb-5">{message}</p>
          <div className="flex justify-end gap-2.5">
            <button onClick={onCancel} className={ghostBtnClass}>
              {cancelLabel}
            </button>
            <button
              ref={confirmRef}
              onClick={onConfirm}
              className={tone === "danger" ? dangerPrimaryBtnClass : primaryBtnClass}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </HudPanel>
    </div>
  );
}
