/**
 * FinFlow logo mark — bracket corners + bold "FIN FLOW" wordmark.
 * Use `variant="color"` for the full blue-background version,
 * `variant="white"` for white-on-transparent (dark backgrounds),
 * `variant="dark"` for dark-on-transparent (light backgrounds).
 */

interface FinFlowLogoProps {
  /** px width of the rendered SVG (height scales proportionally 4:2.8 ratio) */
  width?: number;
  variant?: "color" | "white" | "dark";
  className?: string;
}

export function FinFlowLogo({ width = 120, variant = "color", className }: FinFlowLogoProps) {
  const h = Math.round(width * 0.7);
  const bg = variant === "color" ? "#1a1aff" : "none";
  const fg = variant === "dark" ? "#111" : "#fff";

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 400 280"
      width={width}
      height={h}
      className={className}
      aria-label="FinFlow"
      role="img"
    >
      {variant === "color" && <rect width="400" height="280" fill={bg} rx="16" />}
      {/* Top-left corner bracket */}
      <rect x="52" y="24" width="11" height="52" fill={fg} />
      <rect x="52" y="24" width="52" height="11" fill={fg} />
      {/* Top-right corner bracket */}
      <rect x="337" y="24" width="11" height="52" fill={fg} />
      <rect x="296" y="24" width="52" height="11" fill={fg} />
      {/* Bottom-right corner bracket */}
      <rect x="337" y="204" width="11" height="52" fill={fg} />
      <rect x="296" y="245" width="52" height="11" fill={fg} />
      {/* Wordmark */}
      <text
        x="52"
        y="158"
        fontFamily="'Arial Black', Arial, sans-serif"
        fontWeight="900"
        fontSize="88"
        fill={fg}
        letterSpacing="-3"
      >
        FIN
      </text>
      <text
        x="52"
        y="242"
        fontFamily="'Arial Black', Arial, sans-serif"
        fontWeight="900"
        fontSize="88"
        fill={fg}
        letterSpacing="-3"
      >
        FLOW
      </text>
    </svg>
  );
}

/** Compact horizontal lockup: just the bracket mark + "FinFlow" text, single line. */
export function FinFlowMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="6" fill="#1a1aff" />
      {/* top-left bracket */}
      <rect x="4" y="4" width="2.5" height="10" fill="white" />
      <rect x="4" y="4" width="10" height="2.5" fill="white" />
      {/* top-right bracket */}
      <rect x="25.5" y="4" width="2.5" height="10" fill="white" />
      <rect x="18" y="4" width="10" height="2.5" fill="white" />
      {/* bottom-right bracket */}
      <rect x="25.5" y="18" width="2.5" height="10" fill="white" />
      <rect x="18" y="25.5" width="10" height="2.5" fill="white" />
      {/* "FF" monogram */}
      <text x="6" y="22" fontFamily="Arial Black, Arial, sans-serif" fontWeight="900" fontSize="13" fill="white">FF</text>
    </svg>
  );
}
