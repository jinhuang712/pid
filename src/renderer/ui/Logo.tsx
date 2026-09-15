/**
 * The PID mark. Outlines of p and d come from the OpenCode face; the I is a drawn stem at the
 * same stroke because that face has no usable I. PI takes the ink color, D the amber.
 */
export function Logo({ height = 14, className = "" }: { height?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 1320 840"
      height={height}
      width={(height * 1320) / 840}
      className={className}
      aria-label="PID"
      role="img"
    >
      <title>PID</title>
      <g transform="translate(0,720) scale(1,-1)" fillRule="evenodd">
        <path
          transform="translate(-60,0)"
          d="M60 -120 L60 600 L540 600 L540 0 L180 0 L180 -120 Z M180 120 L420 120 L420 480 L180 480 Z"
          className="fill-ink"
        />
        <rect x="600" y="0" width="120" height="600" className="fill-ink" />
        <path
          transform="translate(780,0)"
          d="M60 0 L60 600 L420 600 L420 720 L540 720 L540 0 Z M180 120 L420 120 L420 480 L180 480 Z"
          className="fill-warn"
        />
      </g>
    </svg>
  );
}
