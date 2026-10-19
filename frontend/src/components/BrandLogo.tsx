import { useId } from "react";
import "./BrandLogo.css";

// Keep in sync with public/favicon.svg (the icons are rendered from it).
const A_PATH = "M160 394 256 112 352 394";
const GROWTH_PATH = "M130 340 215 288 262 318 385 226";

interface BrandIconProps {
  size?: number;
  className?: string;
}

/** App icon: white "A" with a growth line on a blue rounded square. */
export function BrandIcon({ size = 36, className }: BrandIconProps) {
  // useId() contains ":" which breaks url(#...) references in some browsers.
  const id = useId().replace(/:/g, "");

  return (
    <svg
      className={`brand-icon ${className ?? ""}`}
      width={size}
      height={size}
      viewBox="0 0 512 512"
      role="img"
      aria-label="Ainabi Business"
    >
      <defs>
        <linearGradient id={`${id}bg`} x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3B82FF" />
          <stop offset="0.55" stopColor="#155DFC" />
          <stop offset="1" stopColor="#0B3FD6" />
        </linearGradient>
        <linearGradient id={`${id}gr`} x1="130" y1="340" x2="385" y2="226" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0FB5A0" />
          <stop offset="1" stopColor="#2EE6C5" />
        </linearGradient>
        <mask id={`${id}cut`} maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
          <rect width="512" height="512" fill="#fff" />
          <path d={GROWTH_PATH} fill="none" stroke="#000" strokeWidth="66" strokeLinecap="round" strokeLinejoin="round" />
        </mask>
      </defs>
      <rect width="512" height="512" rx="116" fill={`url(#${id}bg)`} />
      <path
        d={A_PATH}
        fill="none"
        stroke="#fff"
        strokeWidth="54"
        strokeLinecap="round"
        strokeLinejoin="round"
        mask={`url(#${id}cut)`}
      />
      <path
        d={GROWTH_PATH}
        fill="none"
        stroke={`url(#${id}gr)`}
        strokeWidth="40"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface BrandLogoProps {
  size?: number;
  /** "dark" for light backgrounds, "light" for dark/colored backgrounds. */
  tone?: "dark" | "light";
  /** Icon only (e.g. collapsed sidebar). */
  iconOnly?: boolean;
  className?: string;
}

/** Icon + "Ainabi / BUSINESS" wordmark. */
export function BrandLogo({ size = 36, tone = "dark", iconOnly = false, className }: BrandLogoProps) {
  return (
    <span className={`brand-logo brand-logo-${tone} ${className ?? ""}`}>
      <BrandIcon size={size} />
      {!iconOnly && (
        <span className="brand-wordmark" style={{ fontSize: Math.round(size * 0.58) }}>
          <span className="brand-wordmark-name">Ainabi</span>
          <span className="brand-wordmark-sub">Business</span>
        </span>
      )}
    </span>
  );
}
