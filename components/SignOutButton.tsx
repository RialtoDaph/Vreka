"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignOutButton() {
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleSignOut}
      className="text-xs font-mono uppercase tracking-wider text-slate-500 hover:text-rose-glow border border-line hover:border-rose-glow/40 rounded-sm px-3 py-2 transition-colors"
    >
      Keluar
    </button>
  );
}
