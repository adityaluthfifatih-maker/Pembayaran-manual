import { useId } from "react";

interface RekhasthaLogoProps {
  /** Icon edge size in px. */
  size?: number;
  /** Show the "Rekhastha" wordmark next to the crest. */
  showWordmark?: boolean;
  /** Show the "by Tilu Company" sub-line under the wordmark. */
  showSubtitle?: boolean;
  /** Colour theme: "dark" for light backgrounds, "light" for dark/emerald backgrounds. */
  variant?: "dark" | "light";
  /** Wordmark font size class (Tailwind). */
  wordmarkClassName?: string;
}

/**
 * Rekhastha brand crest — a golden-outlined emerald shield with Indonesian
 * batik-hint filigree and a metallic gold "R", built entirely in SVG/CSS.
 */
export function RekhasthaCrest({ size = 40 }: { size?: number }) {
  const id = useId();
  const emerald = `emerald-${id}`;
  const gold = `gold-${id}`;
  const goldSoft = `goldsoft-${id}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Rekhastha"
      role="img"
    >
      <defs>
        <linearGradient id={emerald} x1="16" y1="4" x2="48" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0B7A55" />
          <stop offset="0.55" stopColor="#059669" />
          <stop offset="1" stopColor="#045C41" />
        </linearGradient>
        <linearGradient id={gold} x1="20" y1="18" x2="44" y2="52" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FDE9A8" />
          <stop offset="0.35" stopColor="#E7B84C" />
          <stop offset="0.7" stopColor="#B8860B" />
          <stop offset="1" stopColor="#8A6410" />
        </linearGradient>
        <linearGradient id={goldSoft} x1="0" y1="0" x2="0" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#F5D580" />
          <stop offset="1" stopColor="#C9971F" />
        </linearGradient>
      </defs>

      {/* Shield body */}
      <path
        d="M32 3.5 L54 11 V30 C54 45 44.5 55 32 60.5 C19.5 55 10 45 10 30 V11 Z"
        fill={`url(#${emerald})`}
        stroke={`url(#${goldSoft})`}
        strokeWidth="2.5"
      />
      {/* Inner golden bezel */}
      <path
        d="M32 8 L49.5 13.9 V30 C49.5 42.4 41.8 50.8 32 55.6 C22.2 50.8 14.5 42.4 14.5 30 V13.9 Z"
        fill="none"
        stroke={`url(#${gold})`}
        strokeWidth="1.1"
        opacity="0.85"
      />

      {/* Batik-hint filigree — mirrored scroll curls at the base */}
      <path
        d="M18 44 C22 41 24 45 27 43 M46 44 C42 41 40 45 37 43"
        stroke={`url(#${gold})`}
        strokeWidth="1.3"
        strokeLinecap="round"
        fill="none"
        opacity="0.8"
      />
      <circle cx="16.5" cy="18" r="1.1" fill={`url(#${gold})`} opacity="0.75" />
      <circle cx="47.5" cy="18" r="1.1" fill={`url(#${gold})`} opacity="0.75" />

      {/* Metallic "R" */}
      <text
        x="32"
        y="39.5"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="30"
        fontWeight="700"
        fill={`url(#${gold})`}
        stroke="#7A560C"
        strokeWidth="0.4"
      >
        R
      </text>
    </svg>
  );
}

export function RekhasthaLogo({
  size = 40,
  showWordmark = true,
  showSubtitle = false,
  variant = "dark",
  wordmarkClassName = "text-lg",
}: RekhasthaLogoProps) {
  const wordColor = variant === "light" ? "text-white" : "text-primary";
  const subColor = variant === "light" ? "text-emerald-100" : "text-gray-400";

  return (
    <div className="flex items-center gap-2.5">
      <RekhasthaCrest size={size} />
      {showWordmark && (
        <div className="flex flex-col leading-none">
          <span className={`font-black tracking-tight ${wordColor} ${wordmarkClassName}`}>
            Rekhastha
          </span>
          {showSubtitle && (
            <span className={`text-[10px] font-semibold tracking-wide mt-0.5 ${subColor}`}>
              by Tilu Company
            </span>
          )}
        </div>
      )}
    </div>
  );
}
