import { ReactNode } from "react";

function Corner({ className }: { className: string }) {
  return (
    <span
      className={`absolute w-3 h-3 border-cyan-glow/70 ${className}`}
      aria-hidden="true"
    />
  );
}

export default function HudPanel({
  children,
  className = "",
  glow = false,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  glow?: boolean;
  as?: "div" | "section" | "article";
}) {
  return (
    <Tag
      className={`relative bg-panel/70 backdrop-blur-sm border border-line rounded-md p-4 sm:p-5 ${
        glow ? "shadow-glow" : ""
      } ${className}`}
    >
      <Corner className="top-0 left-0 border-t-2 border-l-2 rounded-tl-sm" />
      <Corner className="top-0 right-0 border-t-2 border-r-2 rounded-tr-sm" />
      <Corner className="bottom-0 left-0 border-b-2 border-l-2 rounded-bl-sm" />
      <Corner className="bottom-0 right-0 border-b-2 border-r-2 rounded-br-sm" />
      {children}
    </Tag>
  );
}
