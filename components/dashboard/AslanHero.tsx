import HudPanel from "@/components/HudPanel";

export default function AslanHero() {
  return (
    <HudPanel glow className="flex flex-col items-center text-center py-10">
      <div className="aslan-avatar w-40 h-40 sm:w-48 sm:h-48 mb-4">
        <img src="/aslan.png" alt="Aslan" />
      </div>
      <p className="font-display text-2xl sm:text-3xl font-bold text-white tracking-wide">
        ASLAN AI CORE
      </p>
      <p className="text-xs font-mono uppercase tracking-[0.3em] text-cyan-glow mt-1">
        Asisten Pribadi Vreka
      </p>
    </HudPanel>
  );
}
