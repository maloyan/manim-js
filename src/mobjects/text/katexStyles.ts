/**
 * KaTeX CSS loader for manimweb
 *
 * Ensures the KaTeX stylesheet is loaded for proper LaTeX rendering.
 */

import { logger } from '../../utils/logger';

let stylesPromise: Promise<void> | null = null;
let fontOverrideInjected = false;
let katexStylesheetUrl: string | null =
  'https://cdn.jsdelivr.net/npm/katex@0.16.0/dist/katex.min.css';

/**
 * Configure the stylesheet loaded by {@link ensureKatexStyles}.
 * Pass `null` when the application bundles KaTeX CSS itself.
 */
export function setKatexStylesheetUrl(url: string | null): void {
  if (stylesPromise) {
    throw new Error('KaTeX styles have already been requested');
  }
  katexStylesheetUrl = url;
}

/**
 * Inject a document-level CSS rule to ensure KaTeX respects font-size.
 * This is the only way to disable the 1.21 scaling that katex set by default.
 
 * KaTeX's internal spans and font-size classes can override inherited styles,
 * so we use !important at the .katex root level.
 *
 * @see https://katex.org/docs/font
 */
function ensureKatexFontOverride(): void {
  if (fontOverrideInjected) return;
  if (typeof document === 'undefined') return;

  const existing = document.getElementById('manimweb-katex-font-override');
  if (existing) {
    fontOverrideInjected = true;
    return;
  }

  const style = document.createElement('style');
  style.id = 'manimweb-katex-font-override';
  style.textContent = '.katex { font-size: 1em !important; }';
  document.head.appendChild(style);
  fontOverrideInjected = true;
}

/**
 * Ensure KaTeX styles are loaded in the document.
 * This is called automatically by MathTex on first use.
 *
 * The stylesheet is loaded from a CDN for convenience.
 * In production, you may want to bundle the CSS directly.
 */
export function ensureKatexStyles(): void {
  ensureKatexFontOverride();
  waitForKatexStyles();
}

/**
 * Wait for KaTeX CSS to finish loading.
 * Returns a promise that resolves when the stylesheet is loaded.
 */
export function waitForKatexStyles(): Promise<void> {
  if (stylesPromise) return stylesPromise;
  if (typeof document === 'undefined') {
    stylesPromise = Promise.resolve();
    return stylesPromise;
  }

  const existing = document.getElementById('manimweb-katex-styles') as HTMLLinkElement | null;
  if (existing) {
    stylesPromise = Promise.resolve();
    return stylesPromise;
  }

  if (katexStylesheetUrl === null) {
    stylesPromise = Promise.resolve();
    return stylesPromise;
  }

  stylesPromise = new Promise<void>((resolve) => {
    const link = document.createElement('link');
    link.id = 'manimweb-katex-styles';
    link.rel = 'stylesheet';
    link.href = katexStylesheetUrl!;
    link.crossOrigin = 'anonymous';
    link.onload = () => resolve();
    link.onerror = () => {
      logger.warn('MathTex: KaTeX CSS failed to load from CDN. LaTeX rendering may be degraded.');
      resolve();
    };
    document.head.appendChild(link);
  });

  return stylesPromise;
}

/**
 * Check if KaTeX styles have been injected
 */
export function areKatexStylesLoaded(): boolean {
  return stylesPromise !== null || document.getElementById('manimweb-katex-styles') !== null;
}
