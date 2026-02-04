// Local, dependency-free UI mockup generator.
//
// Purpose: Devassist must always be able to produce a "mockup image" even
// when external image generation fails (no access, rate limits, etc.).
//
// We generate a clean wireframe-style SVG so the UI can render it via a data URL.

function escapeText(s: string) {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function makeWireframeSvg(userMessage: string) {
  const title = escapeText((userMessage || "UI Mockup").trim().slice(0, 54)) || "UI Mockup";
  const subtitle = "Wireframe preview – tell me what to change, or say ‘build it’.";

  // A simple, modern wireframe: header, sidebar, main card, list rows.
  return `
<svg width="1200" height="675" viewBox="0 0 1200 675" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0b0b12"/>
      <stop offset="1" stop-color="#1b0f2e"/>
    </linearGradient>
    <linearGradient id="card" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="rgba(255,255,255,0.10)"/>
      <stop offset="1" stop-color="rgba(255,255,255,0.06)"/>
    </linearGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="10"/>
    </filter>
  </defs>

  <rect width="1200" height="675" fill="url(#bg)"/>

  <!-- Top bar -->
  <rect x="60" y="40" width="1080" height="64" rx="18" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)"/>
  <circle cx="98" cy="72" r="10" fill="rgba(255,255,255,0.25)"/>
  <rect x="120" y="60" width="160" height="24" rx="10" fill="rgba(255,255,255,0.14)"/>
  <rect x="980" y="60" width="130" height="24" rx="12" fill="rgba(255,255,255,0.14)"/>

  <!-- Sidebar -->
  <rect x="60" y="120" width="260" height="515" rx="22" fill="url(#card)" stroke="rgba(255,255,255,0.10)"/>
  <rect x="86" y="152" width="160" height="20" rx="10" fill="rgba(255,255,255,0.16)"/>
  <rect x="86" y="190" width="210" height="68" rx="16" fill="rgba(255,255,255,0.08)"/>
  <rect x="86" y="272" width="210" height="68" rx="16" fill="rgba(255,255,255,0.08)"/>
  <rect x="86" y="354" width="210" height="68" rx="16" fill="rgba(255,255,255,0.08)"/>
  <rect x="86" y="560" width="210" height="48" rx="14" fill="rgba(255,255,255,0.06)"/>

  <!-- Main -->
  <rect x="340" y="120" width="800" height="515" rx="22" fill="url(#card)" stroke="rgba(255,255,255,0.10)"/>
  <text x="380" y="170" fill="rgba(255,255,255,0.92)" font-size="26" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto">
    ${title}
  </text>
  <text x="380" y="198" fill="rgba(255,255,255,0.55)" font-size="14" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto">
    ${escapeText(subtitle)}
  </text>

  <rect x="380" y="230" width="380" height="36" rx="14" fill="rgba(255,255,255,0.08)"/>
  <rect x="770" y="230" width="160" height="36" rx="14" fill="rgba(255,255,255,0.14)"/>

  <!-- Content rows -->
  <rect x="380" y="290" width="720" height="92" rx="18" fill="rgba(255,255,255,0.08)"/>
  <rect x="380" y="396" width="720" height="92" rx="18" fill="rgba(255,255,255,0.08)"/>
  <rect x="380" y="502" width="720" height="92" rx="18" fill="rgba(255,255,255,0.08)"/>

  <rect x="420" y="322" width="220" height="16" rx="8" fill="rgba(255,255,255,0.18)"/>
  <rect x="420" y="348" width="340" height="12" rx="6" fill="rgba(255,255,255,0.10)"/>
  <rect x="930" y="322" width="140" height="16" rx="8" fill="rgba(255,255,255,0.14)"/>

  <rect x="420" y="428" width="260" height="16" rx="8" fill="rgba(255,255,255,0.18)"/>
  <rect x="420" y="454" width="300" height="12" rx="6" fill="rgba(255,255,255,0.10)"/>
  <rect x="930" y="428" width="140" height="16" rx="8" fill="rgba(255,255,255,0.14)"/>

  <rect x="420" y="534" width="240" height="16" rx="8" fill="rgba(255,255,255,0.18)"/>
  <rect x="420" y="560" width="360" height="12" rx="6" fill="rgba(255,255,255,0.10)"/>
  <rect x="930" y="534" width="140" height="16" rx="8" fill="rgba(255,255,255,0.14)"/>
</svg>
`.trim();
}
