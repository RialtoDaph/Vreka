"use client";

import { usePathname } from "next/navigation";

// Keying on pathname forces a remount on every navigation, which restarts
// the CSS animation -- gives every page a consistent subtle fade+rise on
// entry without needing a transition library.
export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="animate-page-in">
      {children}
    </div>
  );
}
