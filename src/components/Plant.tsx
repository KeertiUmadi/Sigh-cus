import { useEffect, useId, useState, type CSSProperties } from "react";
import type { EventKind, Leaf } from "@/lib/plant-core";

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

export type PlantExpression = "squint" | "eye-roll" | "pressed-lips" | "head-shake" | "smug" | "unimpressed" | "watchful";

export function Plant({
  mood,
  leaf,
  speaking,
  pulse,
  reaction,
  previewExpression,
}: {
  mood: number;
  leaf: Leaf;
  speaking: boolean;
  pulse: number;
  reaction?: EventKind | undefined;
  previewExpression?: PlantExpression | undefined;
}) {
  const eyeClip = useId().replace(/:/g, "");
  const [reacting, setReacting] = useState(false);
  useEffect(() => {
    if (pulse === 0) return;
    setReacting(true);
    const timeout = setTimeout(() => setReacting(false), 4200);
    return () => clearTimeout(timeout);
  }, [pulse]);
  const pleased = previewExpression ? previewExpression === "smug" : reacting && (reaction === "drink" || reaction === "back");
  const annoyed = previewExpression ? ["squint", "eye-roll", "pressed-lips", "head-shake"].includes(previewExpression) : reacting && !pleased;
  const expression = previewExpression ?? (pleased ? "smug" : annoyed ? "annoyed" : mood < 45 ? "unimpressed" : "watchful");
  const shake = previewExpression ? previewExpression === "head-shake" : annoyed;
  const roll = previewExpression ? previewExpression === "eye-roll" : annoyed;
  const press = previewExpression ? previewExpression === "pressed-lips" : annoyed;
  const squint = previewExpression ? previewExpression === "squint" : reacting;
  const health = Math.max(0, Math.min(1, mood / 100));
  // Perky when healthy, flat on the desk when dying.
  const droop = -26 + (1 - health) * 62 + (leaf === "wither" ? 10 : 0) - (leaf === "perk" ? 12 : 0);
  const stemLean = (1 - health) * 14;
  const eyeOpen = expression === "unimpressed" ? 0.45 : 0.65 + health * 0.35;
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
      className="h-full w-full"
      role="img"
      aria-label={`Gerald, ${expression}, ${Math.round(mood)} percent happy`}
      data-expression={expression}
    >
      <defs>
        <clipPath id={eyeClip}>
          <ellipse cx="103" cy="227" rx="7" ry={6 * eyeOpen} />
          <ellipse cx="137" cy="227" rx="7" ry={6 * eyeOpen} />
        </clipPath>
      </defs>
      <g className="plant-breathe">
      <g key={`reaction-${pulse}-${previewExpression}`} className={shake ? "plant-head-shake" : pleased ? "plant-smug-nod" : undefined}>
      <g
        key={pulse}
        style={{ transformOrigin: "120px 210px", transition: "transform 1.4s ease-in-out" }}
      >
        {/* stem */}
        <path
          d={`M120 208 C ${118 - stemLean} 170, ${122 + stemLean} 130, ${120 + stemLean} 78`}
          fill="none"
          stroke={stemColor}
          strokeWidth="6"
          strokeLinecap="round"
          style={{ transition: "d 1.4s ease-in-out" }}
        />

        {ATTACH.map((l, i) => {
          const angle = droop * l.side * (i % 2 === 0 ? 1 : 0.88) + l.side * -6;
          const attached = i < attachedCount;
          const fallen = !attached;
          return (
            <g key={i} transform={`translate(${120 + l.side * 2},${l.y})`}>
              {attached && (
                <g
                  style={{
                    transform: `rotate(${angle * l.side}deg) scale(${l.side * l.size}, ${l.size})`,
                    transformOrigin: "0px 0px",
                    transition: "transform 1.4s ease-in-out",
                  }}
                >
                  <path
                    d={LEAF_PATH}
                    fill={leafColor}
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
              )}
              {fallen && (
                <g
                  key={pulse}
                  className="plant-fall"
                  style={
                    {
                      transformOrigin: "0px 0px",
                      "--fall-x": `${l.side * 30}px`,
                      "--fall-rot": `${l.side * 240}deg`,
                      "--fall-delay": `${(i - attachedCount) * 0.45}s`,
                    } as CSSProperties
                  }
                >
                  <path
                    d={LEAF_PATH}
                    fill="var(--color-plant-withered)"
                    stroke="var(--color-plant-withered)"
                    strokeWidth="1.5"
                    transform={`scale(${l.side * l.size}, ${l.size})`}
                  />
                </g>
              )}
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
          d={pleased ? "M95 215 Q103 210 111 214" : annoyed || mood < 45 ? "M95 216 L111 219" : `M96 ${216 - health * 2} L110 ${219 - health * 4}`}
          stroke="var(--color-pot-face)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d={pleased ? "M129 212 Q137 207 145 211" : annoyed || mood < 45 ? "M129 219 L145 216" : `M144 ${216 - health * 2} L130 ${219 - health * 4}`}
          stroke="var(--color-pot-face)"
          strokeWidth="3"
          strokeLinecap="round"
        />

        {/* eyes */}
        <g className="plant-blink">
          <g clipPath={`url(#${eyeClip})`}>
            <rect x="94" y="218" width="52" height="18" fill="var(--color-plant-eye)" />
            <g className={roll ? "plant-eye-roll" : pleased ? "plant-side-eye" : "plant-idle-glance"}>
              <ellipse cx="103" cy="227" rx="3.2" ry="4" fill="var(--color-pot-face)" />
              <ellipse cx="137" cy="227" rx="3.2" ry="4" fill="var(--color-pot-face)" />
            </g>
            <path d="M94 218 H146 V223 H94 Z" fill="var(--color-pot)" className={squint ? "plant-squint" : "plant-lids"} />
          </g>
        </g>

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
            d={annoyed || expression === "unimpressed" ? "M106 242 Q120 241 134 242" : pleased ? "M108 242 Q122 247 134 239" : `M108 241 Q120 ${241 + mouthCurve * 12} 132 241`}
            fill="none"
            stroke="var(--color-pot-face)"
            strokeWidth={annoyed ? "2" : "3"}
            strokeLinecap="round"
            className={press ? "plant-lip-press" : undefined}
            style={{ transition: "d 0.6s ease-in-out" }}
          />
        )}
      </g>
      </g>
      </g>
    </svg>
  );
}
