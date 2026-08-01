import Link from "next/link";
import HudPanel from "@/components/HudPanel";

export type FeedTag = "WARN" | "INFO" | "TIP";

export type FeedItem = {
  id: string;
  tag: FeedTag;
  text: string;
  meta?: string;
  href?: string;
};

const TAG_CLASS: Record<FeedTag, string> = {
  WARN: "text-rose-glow border-rose-glow/40 bg-rose-glow/5",
  INFO: "text-cyan-glow border-cyan-glow/40 bg-cyan-glow/5",
  TIP: "text-amber-glow border-amber-glow/40 bg-amber-glow/5",
};

export default function LiveFeed({ items }: { items: FeedItem[] }) {
  return (
    <HudPanel>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-semibold text-white tracking-wide">
          Live Intelligence Feed
        </h2>
        <span className="w-1.5 h-1.5 rounded-full bg-mint-glow pulse-dot" aria-hidden="true" />
      </div>
      {items.length > 0 ? (
        <ul className="space-y-2.5">
          {items.map((item) => {
            const content = (
              <>
                <span
                  className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded-sm border shrink-0 ${TAG_CLASS[item.tag]}`}
                >
                  {item.tag}
                </span>
                <span className="text-sm text-slate-200 truncate flex-1">{item.text}</span>
                {item.meta && (
                  <span className="text-[11px] font-mono text-slate-500 shrink-0">
                    {item.meta}
                  </span>
                )}
              </>
            );
            return (
              <li
                key={item.id}
                className="border-b border-line/60 pb-2.5 last:border-0 last:pb-0"
              >
                {item.href ? (
                  <Link
                    href={item.href}
                    className="flex items-center gap-3 min-w-0 hover:text-cyan-glow"
                  >
                    {content}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 min-w-0">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">
          Semua aman, nggak ada yang perlu diperhatiin.
        </p>
      )}
    </HudPanel>
  );
}
