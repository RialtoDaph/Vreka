import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";
import SignOutButton from "@/components/SignOutButton";
import CommandPalette from "@/components/CommandPalette";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen md:flex">
      <aside className="md:w-56 md:shrink-0 border-b md:border-b-0 md:border-r border-line bg-panel/40 backdrop-blur-sm p-4 md:p-5 md:min-h-screen">
        <div className="flex items-center justify-between md:block mb-0 md:mb-8">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-glow pulse-dot" />
            <span className="font-display font-bold tracking-widest text-white text-lg">
              VREKA
            </span>
          </div>
          <div className="md:hidden">
            <SignOutButton />
          </div>
        </div>
        <div className="mt-4 md:mt-0">
          <Sidebar />
        </div>
        <div className="hidden md:block mt-8 pt-4 border-t border-line">
          <p className="text-[11px] font-mono text-slate-400 truncate mb-3">
            {user?.email}
          </p>
          <SignOutButton />
          <p className="text-[10px] font-mono text-slate-400 mt-4">
            <kbd className="border border-line rounded-sm px-1 py-0.5">⌘K</kbd> buat cari cepat
          </p>
        </div>
      </aside>
      <main className="flex-1 p-4 sm:p-6 lg:p-8 pb-28 max-w-6xl mx-auto w-full">
        {children}
      </main>
      <CommandPalette />
    </div>
  );
}
