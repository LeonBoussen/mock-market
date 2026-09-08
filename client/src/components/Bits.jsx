export function Splash() {
  return (
    <div className="splash">
      <Logo size={44} />
      <div className="spin" style={{ marginTop: 22 }} />
    </div>
  );
}

export function Logo({ size = 30, wordmark = true }) {
  return (
    <span className="brand-lockup">
      <span className="brand-mark" style={{ width: size, height: size, borderRadius: Math.round(size * 0.3) }}>
        <svg viewBox="0 0 64 64" width={size * 0.62} height={size * 0.62} fill="none">
          <path d="M18 42l8-11 7 5 12-16" stroke="white" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="45" cy="20" r="3.4" fill="white" />
        </svg>
      </span>
      {wordmark && (
        <span className="brand-word">
          Mock Market
          <span className="brand-sub">practice trading</span>
        </span>
      )}
    </span>
  );
}

// Tiny SVG sparkline (pure, no deps)
export function Spark({ points, width = 120, height = 34, stroke = 'var(--brand-1)', fill = true }) {
  if (!points || points.length < 2) return <svg width={width} height={height} />;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const pad = 2;
  const step = (width - pad * 2) / (points.length - 1);
  const coords = points.map((p, i) => [
    pad + i * step,
    pad + (height - pad * 2) * (1 - (p - min) / span),
  ]);
  const line = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const last = coords[coords.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      {fill && (
        <path d={`${line} L${last[0]},${height} L${coords[0][0]},${height} Z`} fill={stroke} opacity="0.09" stroke="none" />
      )}
      <path d={line} fill="none" stroke={stroke} strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function Bar({ value, max, color }) {
  const w = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="alloc-bar">
      <div style={{ width: `${Math.min(100, w)}%`, background: color }} />
    </div>
  );
}
