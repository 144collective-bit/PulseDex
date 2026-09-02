/**
 * The page shown before the site will open.
 *
 * Plain HTML built at the edge rather than anything from the app: it has to
 * render for someone who has deliberately not been sent the application, so it
 * can share nothing with it - no stylesheet, no bundle, no component. What it
 * can share is the brand, and it does that by hand.
 *
 * The mark is the same polyline as `public/pulse-mark.svg`, point for point, so
 * the shutter and the site read as one thing. The palette is the one defined in
 * `src/styles/theme.css`.
 */

/** Anything interpolated into the markup goes through here first. */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function gatePage({ next = '/', error = false, misconfigured = false } = {}) {
  const message = misconfigured
    ? 'This deployment has no signing secret, so it cannot let anyone in. SESSION_SECRET needs to be set.'
    : error
      ? 'That password was not recognised.'
      : ''

  const errorBlock = message
    ? '<div class="error"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5"/><path d="M12 16.2v.1"/></svg><span>' +
      escapeHtml(message) +
      '</span></div>'
    : ''

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="robots" content="noindex, nofollow" />
<meta name="color-scheme" content="dark" />
<title>PulseDEX &mdash; Private testing</title>
<link rel="icon" type="image/svg+xml" href="/pulse-mark.svg" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
<style>
  *, *::before, *::after { box-sizing: border-box; }
  :root {
    --bg: #080b11;
    --card: rgba(18, 24, 38, 0.75);
    --line: rgba(255, 255, 255, 0.08);
    --text: #f8fafc;
    --dim: #94a3b8;
    --muted: #64748b;
    --cyan: #00e5ff;
    --green: #00ff9d;
    --sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    --mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  html, body { height: 100%; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font-family: var(--sans);
    -webkit-font-smoothing: antialiased;
    display: grid;
    place-items: center;
    padding: 24px;
    position: relative;
    overflow: hidden;
  }
  /* Two soft lights and a fine grid: the app's own backdrop, simplified. */
  .glow {
    position: fixed; inset: 0; pointer-events: none;
    background:
      radial-gradient(60ch 60ch at 12% -10%, rgba(0, 229, 255, 0.10), transparent 60%),
      radial-gradient(50ch 50ch at 105% 110%, rgba(217, 70, 239, 0.10), transparent 60%);
  }
  .grid {
    position: fixed; inset: 0; pointer-events: none;
    background-image:
      linear-gradient(rgba(255,255,255,0.022) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.022) 1px, transparent 1px);
    background-size: 48px 48px;
    -webkit-mask-image: radial-gradient(70ch 55ch at 50% 45%, #000 40%, transparent 100%);
    mask-image: radial-gradient(70ch 55ch at 50% 45%, #000 40%, transparent 100%);
  }
  .card {
    position: relative;
    width: 100%;
    max-width: 428px;
    background: var(--card);
    -webkit-backdrop-filter: blur(14px);
    backdrop-filter: blur(14px);
    border: 1px solid var(--line);
    border-radius: 18px;
    padding: 34px 30px 26px;
    box-shadow: 0 24px 70px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }
  /* A single hairline of brand colour along the top edge. */
  .card::before {
    content: ''; position: absolute; left: 22px; right: 22px; top: -1px; height: 1px;
    background: linear-gradient(90deg, transparent, var(--cyan), var(--green), transparent);
    opacity: 0.85;
  }
  .mark { display: flex; align-items: center; gap: 12px; margin-bottom: 26px; }
  .mark svg { display: block; width: 42px; height: 42px; flex: none; }
  .wordmark { font-size: 19px; font-weight: 800; letter-spacing: 0.16em; }
  .wordmark span { color: var(--green); }
  .tag {
    display: inline-flex; align-items: center; gap: 7px;
    font-family: var(--mono); font-size: 10px; font-weight: 500;
    letter-spacing: 0.16em; text-transform: uppercase; color: var(--cyan);
    background: rgba(0, 229, 255, 0.10);
    border: 1px solid rgba(0, 229, 255, 0.22);
    border-radius: 999px; padding: 5px 11px; margin-bottom: 16px;
  }
  .dot {
    width: 6px; height: 6px; border-radius: 50%; background: var(--cyan); flex: none;
    animation: blink 2s ease-in-out infinite;
  }
  @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
  h1 { margin: 0 0 9px; font-size: 22px; font-weight: 600; letter-spacing: -0.015em; }
  p.lede { margin: 0 0 24px; font-size: 14px; line-height: 1.55; color: var(--dim); }
  label {
    display: block; font-family: var(--mono); font-size: 10px; font-weight: 500;
    letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted); margin-bottom: 8px;
  }
  input {
    width: 100%; padding: 13px 15px; font-family: var(--mono); font-size: 15px;
    color: var(--text); background: #0d121c; border: 1px solid var(--line);
    border-radius: 11px; outline: none; transition: border-color .15s, box-shadow .15s;
  }
  input::placeholder { color: #3d4757; }
  input:focus {
    border-color: rgba(0, 229, 255, 0.5);
    box-shadow: 0 0 0 3px rgba(0, 229, 255, 0.12);
  }
  button {
    width: 100%; margin-top: 14px; padding: 13px 16px; font-family: var(--sans);
    font-size: 14px; font-weight: 700; letter-spacing: 0.01em; color: #04121a;
    background: linear-gradient(95deg, var(--cyan), var(--green));
    border: none; border-radius: 11px; cursor: pointer;
    transition: filter .15s, transform .05s;
  }
  button:hover { filter: brightness(1.08); }
  button:active { transform: translateY(1px); }
  .error {
    display: flex; gap: 9px; align-items: flex-start;
    margin: 0 0 18px; padding: 11px 13px; font-size: 13px; line-height: 1.5;
    color: #ffe3e8; background: rgba(244, 63, 94, 0.10);
    border: 1px solid rgba(244, 63, 94, 0.28); border-radius: 10px;
  }
  .error svg { flex: none; margin-top: 1px; }
  .foot {
    margin: 22px 0 0; padding-top: 16px; border-top: 1px solid var(--line);
    font-size: 12px; line-height: 1.5; color: var(--muted);
  }
  @media (prefers-reduced-motion: reduce) {
    .dot { animation: none; }
  }
  @media (max-width: 420px) {
    .card { padding: 28px 22px 22px; border-radius: 16px; }
    h1 { font-size: 20px; }
  }
</style>
</head>
<body>
  <div class="glow"></div>
  <div class="grid"></div>

  <main class="card">
    <div class="mark">
      <svg viewBox="0 0 1024 1024" aria-hidden="true">
        <defs>
          <linearGradient id="pulse" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#00e5ff" />
            <stop offset="100%" stop-color="#00ff9d" />
          </linearGradient>
        </defs>
        <rect width="1024" height="1024" rx="230" fill="#0d121c" stroke="rgba(255,255,255,0.08)" stroke-width="12" />
        <polyline
          points="185,543 293,543 318,468 378,600 432,257 510,763 543,545 610,545 668,433 727,543 838,543"
          fill="none" stroke="url(#pulse)" stroke-width="34"
          stroke-linecap="round" stroke-linejoin="round">
          <animate attributeName="stroke-dasharray" from="0 1600" to="1600 0" dur="1.5s" fill="freeze" />
        </polyline>
      </svg>
      <div class="wordmark">PULSE<span>DEX</span></div>
    </div>

    <div class="tag"><span class="dot"></span>Private testing</div>
    <h1>This build is locked</h1>
    <p class="lede">
      Live trading is being tested against real pools on PulseChain. The site reopens
      once that is finished.
    </p>

    ${errorBlock}

    <form method="POST" action="/__gate" autocomplete="off">
      <input type="hidden" name="next" value="${escapeHtml(next)}" />
      <label for="password">Access password</label>
      <input id="password" name="password" type="password" placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
             autofocus required autocomplete="current-password" spellcheck="false" />
      <button type="submit">Unlock</button>
    </form>

    <p class="foot">
      Expecting access and seeing this for the first time? The password has changed.
      Nothing behind this page is finished.
    </p>
  </main>
</body>
</html>`
}
