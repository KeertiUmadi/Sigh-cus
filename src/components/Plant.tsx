import type { Leaf } from "@/lib/plant-core";

/**
 * Gerald. A potted plant whose leaves physically droop as his mood drops, and
 * whose face sighs when he speaks.
 */

const ATTACH = [
  { y: 154, side: -1, size: 1 },
  { y: 136, side: 1, size: 1.12 },
  { y: 118, side: -1, size: 1.05 },
  { y: 101, side: 1, size: 0.9 },
  { y: 86, side: -1, size: 0.78 },
];

const LEAF_PATH = "M0 0 C 20 -16, 44 -13, 58 1 C 44 15, 20 17, 0 0 Z";

export function Plant({
  mood,
  leaf,
  speaking,
  pulse,
}: {
  mood: number;
  leaf: Leaf;
  speaking: boolean;
  pulse: number;
}) {
  const health = Math.max(0, Math.min(1, mood / 100));
  // Perky when healthy, flat on the desk when dying.
  const droop = -26 + (1 - health) * 62 + (leaf === "wither" ? 10 : 0) - (leaf === "perk" ? 12 : 0);
  const stemLean = (1 - health) * 14;
  const eyeOpen = 0.35 + health * 0.65;
  const mouthCurve = speaking ? 1 : health * 0.8 - 0.4;
  // Leaves brown out as mood drops, then start dropping off entirely.
  const witherMix = Math.round(Math.min(1, Math.max(0, (0.6 - health) / 0.45)) * 85);
  const leafColor = `color-mix(in srgb, var(--color-plant-leaf) ${100 - witherMix}%, var(--color-plant-withered))`;
  const stemColor = `color-mix(in srgb, var(--color-plant-stem) ${100 - witherMix}%, var(--color-plant-withered))`;
  // Shed order: topmost (smallest) leaves give up first.
  const attachedCount =
    health > 0.55 ? 5 : health > 0.35 ? 4 : health > 0.18 ? 3 : health > 0.05 ? 2 : 0;

  return (
    <svg
      viewBox="0 0 240 268"
      className={`h-full w-full ${leaf === "wither" ? "plant-shudder" : ""}`}
      role="img"
      aria-label={`A desk plant that is ${Math.round(mood)} percent happy`}
    >
      <g
        key={pulse}
        style={{ transformOrigin: "120px 210px", transition: "transform 1.4s ease-in-out" }}
      >
        {/* stem */}
        <path
          d={`M120 208 C ${118 - stemLean} 170, ${122 + stemLean} 130, ${120 + stemLean} 78`}
          fill="none"
          stroke="var(--color-plant-stem)"
          strokeWidth="6"
          strokeLinecap="round"
          style={{ transition: "d 1.4s ease-in-out" }}
        />

        {ATTACH.map((l, i) => {
          const angle = droop * l.side * (i % 2 === 0 ? 1 : 0.88) + l.side * -6;
          return (
            <g key={i} transform={`translate(${120 + l.side * 2},${l.y})`}>
              <g
                style={{
                  transform: `rotate(${angle * l.side}deg) scale(${l.side * l.size}, ${l.size})`,
                  transformOrigin: "0px 0px",
                  transition: "transform 1.4s ease-in-out",
                }}
              >
                <path
                  d={LEAF_PATH}
                  fill="var(--color-plant-leaf)"
                  stroke="var(--color-plant-leaf-vein)"
                  strokeWidth="1.5"
                  opacity={0.55 + health * 0.45}
                />
                <path
                  d="M2 0 C 20 -4, 40 -3, 55 1"
                  fill="none"
                  stroke="var(--color-plant-leaf-vein)"
                  strokeWidth="1.5"
                  opacity="0.7"
                />
              </g>
            </g>
          );
        })}
      </g>

      {/* pot, with a face */}
      <g>
        <path
          d="M74 196 L166 196 L156 252 Q154 260 146 260 L94 260 Q86 260 84 252 Z"
          fill="var(--color-pot)"
        />
        <rect x="68" y="186" width="104" height="16" rx="6" fill="var(--color-pot-rim)" />
        <ellipse cx="120" cy="192" rx="42" ry="5" fill="var(--color-soil)" />

        {/* brows */}
        <path
          d={`M96 ${216 - health * 2} L110 ${219 - health * 4}`}
          stroke="var(--color-pot-face)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d={`M144 ${216 - health * 2} L130 ${219 - health * 4}`}
          stroke="var(--color-pot-face)"
          strokeWidth="3"
          strokeLinecap="round"
        />

        {/* eyes */}
        <ellipse
          cx="103"
          cy="227"
          rx="5"
          ry={4.5 * eyeOpen}
          fill="var(--color-pot-face)"
          style={{ transition: "ry 0.5s ease-in-out" }}
        />
        <ellipse
          cx="137"
          cy="227"
          rx="5"
          ry={4.5 * eyeOpen}
          fill="var(--color-pot-face)"
          style={{ transition: "ry 0.5s ease-in-out" }}
        />

        {/* mouth: a flat line that opens when he talks */}
        {speaking ? (
          <ellipse
            cx="120"
            cy="241"
            rx="9"
            ry="6"
            fill="var(--color-pot-face)"
            className="plant-talk"
          />
        ) : (
          <path
            d={`M108 241 Q120 ${241 + mouthCurve * 12} 132 241`}
            fill="none"
            stroke="var(--color-pot-face)"
            strokeWidth="3"
            strokeLinecap="round"
            style={{ transition: "d 0.6s ease-in-out" }}
          />
        )}
      </g>
    </svg>
  );
}
