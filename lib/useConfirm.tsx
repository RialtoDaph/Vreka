"use client";

import { useCallback, useRef, useState } from "react";
import ConfirmDialog, { type ConfirmTone } from "@/components/ConfirmDialog";

type PendingConfirm = {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
};

export type ConfirmOptions = Omit<PendingConfirm, "message">;

// Promise-based, drop-in replacement for window.confirm() that renders a
// themed dialog instead of the browser-native one:
//   if (!window.confirm("Yakin?")) return;
// becomes
//   if (!(await confirm("Yakin?"))) return;
// Render `confirmDialog` somewhere in the component's JSX for it to appear.
export function useConfirm() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((message: string, opts?: ConfirmOptions) => {
    setPending({ message, ...opts });
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  function settle(result: boolean) {
    setPending(null);
    resolverRef.current?.(result);
    resolverRef.current = null;
  }

  const confirmDialog = pending ? (
    <ConfirmDialog
      message={pending.message}
      confirmLabel={pending.confirmLabel}
      cancelLabel={pending.cancelLabel}
      tone={pending.tone}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  ) : null;

  return { confirm, confirmDialog };
}
