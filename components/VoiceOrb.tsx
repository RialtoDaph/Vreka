export type OrbState = "idle" | "listening" | "thinking" | "speaking";

export default function VoiceOrb({ state }: { state: OrbState }) {
  return (
    <div className="voice-orb" data-orb-state={state}>
      <div className="orb-ring" />
      <div className="orb-layer orb-layer-1" />
      <div className="orb-layer orb-layer-2" />
      <div className="orb-layer orb-layer-3" />
      <div className="orb-core" />
    </div>
  );
}
