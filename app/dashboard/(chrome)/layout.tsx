import { createClient } from "@/lib/supabase/server";
import AppChrome from "@/components/AppChrome";
import BottomNav from "@/components/BottomNav";
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
      <AppChrome email={user?.email} />
      <main className="flex-1 p-4 sm:p-6 lg:p-8 pb-28 md:pb-8 max-w-6xl mx-auto w-full">
        {children}
      </main>
      <BottomNav />
      <CommandPalette />
    </div>
  );
}
