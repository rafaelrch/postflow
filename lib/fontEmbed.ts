// Gera o CSS de @font-face com as fontes embutidas em data: URLs para passar
// como `fontEmbedCSS` ao html-to-image. Fazer isso aqui (em vez de deixar a
// biblioteca escanear document.styleSheets) evita o SecurityError "Cannot
// access rules" em stylesheets cross-origin/de extensões e permite reusar o
// resultado entre slides — a biblioteca re-baixa todas as fontes a cada captura.

const FONT_FACE_RE = /@font-face\s*{[^}]*}/g;
const URL_RE = /url\((['"]?)([^'")]+)\1\)/g;

let cached: Promise<string> | null = null;

export function getFontEmbedCss(): Promise<string> {
  if (!cached) {
    cached = buildFontEmbedCss().catch((err) => {
      cached = null;
      throw err;
    });
  }
  return cached;
}

async function buildFontEmbedCss(): Promise<string> {
  const blocks: { css: string; baseUrl: string }[] = [];

  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList | null = null;
    try {
      rules = sheet.cssRules;
    } catch {
      // Stylesheet cross-origin sem CORS (ex.: injetada por extensão) — se
      // tiver href tentamos ler via fetch abaixo; senão, não afeta os slides.
    }

    if (rules) {
      collectFontFaces(rules, sheet.href ?? document.baseURI, blocks);
    } else if (sheet.href) {
      try {
        const text = await (await fetch(sheet.href)).text();
        for (const css of text.match(FONT_FACE_RE) ?? []) {
          blocks.push({ css, baseUrl: sheet.href });
        }
      } catch {
        // Sem acesso nem via fetch — ignora.
      }
    }
  }

  const embedded = await Promise.all(blocks.map((b) => inlineFontUrls(b.css, b.baseUrl)));
  return embedded.join('\n');
}

function collectFontFaces(rules: CSSRuleList, baseUrl: string, out: { css: string; baseUrl: string }[]) {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSFontFaceRule) {
      out.push({ css: rule.cssText, baseUrl });
    } else if (rule instanceof CSSImportRule) {
      try {
        if (rule.styleSheet) {
          collectFontFaces(rule.styleSheet.cssRules, rule.styleSheet.href ?? baseUrl, out);
        }
      } catch {
        // @import cross-origin ilegível — ignora.
      }
    }
  }
}

async function inlineFontUrls(css: string, baseUrl: string): Promise<string> {
  const urls = new Set<string>();
  for (const match of css.matchAll(URL_RE)) {
    if (!match[2].startsWith('data:')) urls.add(match[2]);
  }

  const replacements = await Promise.all(
    Array.from(urls).map(async (raw) => {
      try {
        return [raw, await toDataUrl(new URL(raw, baseUrl).href)] as const;
      } catch {
        return [raw, raw] as const; // mantém a URL original se o download falhar
      }
    })
  );

  let out = css;
  for (const [raw, data] of replacements) {
    out = out.split(raw).join(data);
  }
  return out;
}

async function toDataUrl(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
