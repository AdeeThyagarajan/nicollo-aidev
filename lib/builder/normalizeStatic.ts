type FileSpec = { path: string; content: string };

/**
 * Ensures the generated static prototype is runnable inside the preview iframe.
 * The model sometimes forgets to include the CSS/JS tags even when it outputs the files.
 * We fix that here without changing any UI chrome.
 */
export function normalizeStaticBundle(files: FileSpec[]): FileSpec[] {
  const map = new Map(files.map((f) => [f.path, f.content] as const));
  const idx = map.get("index.html");
  if (!idx) return files;

  let html = idx;

  const hasCss = /<link[^>]+href=["'](?:\.\/)?style\.css["'][^>]*>/i.test(html);
  const hasJs = /<script[^>]+src=["'](?:\.\/)?app\.js["'][^>]*>/i.test(html);

  if (!hasCss) {
    if (/<\/head>/i.test(html)) {
      html = html.replace(/<\/head>/i, `  <link rel="stylesheet" href="style.css" />\n</head>`);
    } else {
      html = `<head>\n  <link rel="stylesheet" href="style.css" />\n</head>\n` + html;
    }
  }

  if (!hasJs) {
    if (/<\/body>/i.test(html)) {
      html = html.replace(/<\/body>/i, `  <script defer src="app.js"></script>\n</body>`);
    } else {
      html = html + `\n<script defer src="app.js"></script>\n`;
    }
  }

  map.set("index.html", html);

  return files.map((f) => ({ ...f, content: map.get(f.path) ?? f.content }));
}
