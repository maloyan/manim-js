/**
 * MathJaxRenderer - LaTeX rendering via MathJax SVG output.
 *
 * MathJax supports virtually all LaTeX commands and packages (including
 * chemfig, tikz, custom macros, \usepackage, \begin{align}, etc.).
 * It runs entirely in the browser and produces SVG output.
 *
 * This renderer is used as a fallback when KaTeX cannot handle the input,
 * or when explicitly requested via `renderer: 'mathjax'`.
 *
 * MathJax is dynamically imported to keep the default bundle small.
 */

import katex from 'katex';
import type { VGroup } from '../../core/VGroup';
import { svgToVMobjects } from './svgPathParser';
// Type-only imports so MathJax never enters the main module graph. The
// runtime values arrive lazily through `./MathJaxBundle.js`.
import type { LiteAdaptor } from '@mathjax/src/js/adaptors/liteAdaptor.js';
import type { LiteElement } from '@mathjax/src/js/adaptors/lite/Element.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MathJaxRenderOptions {
  /** Display mode (block) vs inline mode. Default: true */
  displayMode?: boolean;
  /** Custom LaTeX preamble (e.g. '\\usepackage{amsmath}'). Merged with defaults. */
  preamble?: string;
  /** Custom macros as { name: expansion }. */
  macros?: Record<string, string>;
  /** Color applied to the output (CSS color string). Default: '#ffffff' */
  color?: string;
}

export interface MathJaxRenderResult {
  /** The root SVG element produced by MathJax */
  svgElement: SVGElement;
  /** VMobject group with one child per glyph/path */
  vmobjectGroup: VGroup;
  /** Original SVG string (for debugging or caching) */
  svgString: string;
  /** Bounding width in MathJax "ex" units */
  width: number;
  /** Bounding height in MathJax "ex" units */
  height: number;
}

// ---------------------------------------------------------------------------
// Window augmentation for global MathJax
// ---------------------------------------------------------------------------

interface MathJaxAdaptor {
  outerHTML(node: unknown): string;
  [key: string]: unknown;
}

interface MathJaxGlobal {
  tex2svg?: (input: string, options?: Record<string, unknown>) => HTMLElement;
  tex?: Record<string, unknown>;
  svg?: Record<string, unknown>;
  startup?: {
    typeset?: boolean;
    ready?: () => void;
    defaultReady?: () => void;
    adaptor?: MathJaxAdaptor;
    output?: { fontCache?: { defs?: unknown } };
  };
}

interface WindowWithMathJax {
  MathJax: MathJaxGlobal;
}

// ---------------------------------------------------------------------------
// Internal MathJax module state (discriminated union)
// ---------------------------------------------------------------------------

interface MathJaxModuleGlobal {
  strategy: 'global';
  MathJax: MathJaxGlobal;
}

/** Generic callable constructor for dynamic MathJax classes */
type MathJaxConstructor = new (options: Record<string, unknown>) => Record<string, unknown>;

interface MathJaxSingleton {
  document: (
    content: string,
    options: Record<string, unknown>,
  ) => {
    convert: (input: string, options: Record<string, unknown>) => unknown;
  };
  /** Internal registry the npm path uses to assert handler registration. */
  handlers?: { [Symbol.iterator]?: () => Iterator<unknown> };
}

interface MathJaxModuleNpm {
  strategy: 'npm';
  mathjax: MathJaxSingleton;
  TeX: MathJaxConstructor;
  SVG: MathJaxConstructor;
  adaptor: LiteAdaptor;
}

/**
 * Thrown when the npm-path `mathjax` singleton produced by `RegisterHTMLHandler`
 * does not share its handler list with the `mathjax.document(...)` callsite.
 * This typically means the downstream bundler (e.g. esm.sh) re-bundled
 * `@mathjax/src` into separate copies. The error triggers the CDN fallback.
 */
export class MathJaxSingletonMismatchError extends Error {
  constructor(message = 'MathJax singletons split during bundling') {
    super(message);
    this.name = 'MathJaxSingletonMismatchError';
  }
}

type MathJaxModuleState = MathJaxModuleGlobal | MathJaxModuleNpm;

// ---------------------------------------------------------------------------
// Internal MathJax handle (lazy-loaded)
// ---------------------------------------------------------------------------

/** Cached MathJax module after first dynamic import */
let mathjaxModule: MathJaxModuleState | null = null;

/** Promise for the in-flight import (prevents duplicate loads) */
let mathjaxLoadPromise: Promise<MathJaxModuleState> | null = null;
let mathjaxScriptUrl: string | null = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg-full.js';

/**
 * Configure the browser script used if the bundled MathJax modules cannot load.
 * Pass `null` to disable the network fallback.
 */
export function setMathJaxScriptUrl(url: string | null): void {
  if (mathjaxLoadPromise) {
    throw new Error('MathJax loading has already started');
  }
  mathjaxScriptUrl = url;
}

/**
 * Probe whether `RegisterHTMLHandler` actually populated the `mathjax`
 * singleton we will later call `.document(...)` on. Returns true when at
 * least one handler is registered.
 */
function hasRegisteredHandler(mathjax: MathJaxSingleton): boolean {
  const handlers = mathjax.handlers;
  if (!handlers) return false;
  // HandlerList exposes `Symbol.iterator`; counting via iteration covers
  // both real lists and any test stubs that match the same shape.
  if (typeof handlers[Symbol.iterator] === 'function') {
    for (const item of handlers as Iterable<unknown>) {
      void item;
      return true;
    }
    return false;
  }
  // Last-ditch structural check for an `items` array if the iterator shape
  // ever changes upstream.
  const items = (handlers as { items?: unknown[] }).items;
  return Array.isArray(items) && items.length > 0;
}

/**
 * Dynamically load MathJax's SVG output module.
 *
 * We use the "@mathjax/src" npm package which provides a programmatic API
 * without needing the global MathJax bootstrap. If that is not available we
 * fall back to loading via a CDN script tag.
 */
async function loadMathJax(): Promise<MathJaxModuleState> {
  if (mathjaxModule) return mathjaxModule;
  if (mathjaxLoadPromise) return mathjaxLoadPromise;

  mathjaxLoadPromise = (async () => {
    // Strategy 1: load `@mathjax/src` through a single internal wrapper
    // module. Collapsing every `@mathjax/src` access into one dynamic import
    // forces downstream bundlers (esm.sh, CDNs) to emit a single chunk, which
    // keeps the `mathjax` singleton unique. See ./MathJaxBundle.ts and #396.
    try {
      const bundle = await import('./MathJaxBundle.js');

      const adaptor = bundle.liteAdaptor();
      bundle.RegisterHTMLHandler(adaptor);

      // Verify the handler landed on the same `mathjax` singleton we will
      // later call `.document()` on. If the bundler split the chunk we will
      // observe an empty handler list here and fall through to the CDN path
      // instead of caching a broken state.
      const mathjax = bundle.mathjax as unknown as MathJaxSingleton;
      if (!hasRegisteredHandler(mathjax)) {
        throw new MathJaxSingletonMismatchError();
      }

      const result: MathJaxModuleNpm = {
        mathjax,
        TeX: bundle.TeX as unknown as MathJaxConstructor,
        SVG: bundle.SVG as unknown as MathJaxConstructor,
        adaptor,
        strategy: 'npm' as const,
      };
      mathjaxModule = result;
      return result;
    } catch {
      // Bundle missing or singleton split -- fall through to CDN strategy.
    }

    // Strategy 2: global MathJax loaded via <script> tag (CDN fallback)
    if (typeof window !== 'undefined') {
      const win = window as unknown as WindowWithMathJax;
      if (win.MathJax && win.MathJax.tex2svg) {
        const result: MathJaxModuleGlobal = { strategy: 'global' as const, MathJax: win.MathJax };
        mathjaxModule = result;
        return result;
      }

      if (mathjaxScriptUrl === null) {
        throw new Error('MathJax npm modules failed and the script fallback is disabled');
      }

      // Load the configured browser script
      await new Promise<void>((resolve, reject) => {
        // Configure before loading
        win.MathJax = {
          tex: {
            inlineMath: [
              ['$', '$'],
              ['\\(', '\\)'],
            ],
            displayMath: [
              ['$$', '$$'],
              ['\\[', '\\]'],
            ],
            packages: { '[+]': ['ams', 'newcommand', 'configmacros'] },
          },
          svg: {
            fontCache: 'global',
          },
          startup: {
            typeset: false,
            ready: () => {
              win.MathJax.startup?.defaultReady?.();
              resolve();
            },
          },
        };

        const script = document.createElement('script');
        script.src = mathjaxScriptUrl!;
        script.async = true;
        script.onerror = () => reject(new Error('Failed to load MathJax from CDN'));
        document.head.appendChild(script);

        // Timeout after 15 seconds
        setTimeout(() => reject(new Error('MathJax CDN load timed out')), 15000);
      });

      const result: MathJaxModuleGlobal = { strategy: 'global' as const, MathJax: win.MathJax };
      mathjaxModule = result;
      return result;
    }

    throw new Error('MathJax could not be loaded: no npm package and no browser environment.');
  })();

  return mathjaxLoadPromise;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether MathJax has already been loaded.
 */
export function isMathJaxLoaded(): boolean {
  return mathjaxModule !== null;
}

/**
 * Pre-load MathJax so the first render is fast.
 * Call this early (e.g. on page load) if you know LaTeX will be used.
 */
export async function preloadMathJax(): Promise<void> {
  await loadMathJax();
}

/**
 * Render a LaTeX string to SVG using MathJax and convert the result
 * into VMobject paths suitable for manim-web animation.
 *
 * IMPORTANT: The returned VMobject coordinates are raw MathJax SVG font units
 * (not world units and not normalized to [0, 1]). MathTex applies the final
 * point->world conversion during `_scaleToTarget()`.
 *
 * @param texString - The raw LaTeX to render (without delimiters).
 * @param options   - Rendering options.
 * @returns A MathJaxRenderResult containing the SVG element and VMobject group.
 */
export async function renderLatexToSVG(
  texString: string,
  options: MathJaxRenderOptions = {},
): Promise<MathJaxRenderResult> {
  const { displayMode = true, color = '#ffffff', macros = {} } = options;

  const mj = await loadMathJax();

  let svgElement: SVGElement;
  let svgString: string;

  if (mj.strategy === 'global') {
    // ------------------------------------------------------------------
    // Global MathJax (CDN)
    // ------------------------------------------------------------------
    const MathJax = mj.MathJax;

    // Merge custom macros
    if (Object.keys(macros).length > 0) {
      MathJax.tex = MathJax.tex || {};
      const existingMacros = (MathJax.tex.macros as Record<string, string> | undefined) ?? {};
      MathJax.tex.macros = { ...existingMacros, ...macros };
    }

    // Render
    if (!MathJax.tex2svg) {
      throw new Error('MathJax.tex2svg is not available');
    }
    const wrapper: HTMLElement = MathJax.tex2svg(texString, { display: displayMode });
    svgElement = wrapper.querySelector('svg')!;

    if (!svgElement) {
      throw new Error(`MathJax failed to produce SVG for: ${texString}`);
    }

    // Inject global font cache <defs> into the SVG so that <use> refs
    // can be resolved by svgToVMobjects.  MathJax with fontCache:'global'
    // stores glyph <path> definitions in a separate internal node tree
    // (MathJax.startup.output.fontCache.defs) instead of inlining them.
    try {
      const adaptor = MathJax.startup?.adaptor;
      const fontDefs = MathJax.startup?.output?.fontCache?.defs;
      if (adaptor && fontDefs) {
        const defsHTML = adaptor.outerHTML(fontDefs);
        if (defsHTML) {
          const tmp = document.createElement('div');
          tmp.innerHTML = defsHTML;
          const defsEl = tmp.querySelector('defs');
          if (defsEl) {
            svgElement.insertBefore(defsEl, svgElement.firstChild);
          }
        }
      }
    } catch {
      // Non-critical: svgToVMobjects will just produce fewer paths
    }

    svgString = svgElement.outerHTML;
  } else {
    // ------------------------------------------------------------------
    // npm @mathjax/src
    // ------------------------------------------------------------------
    const { mathjax: MathJax, TeX, SVG, adaptor } = mj;

    const tex = new TeX({
      packages: ['base', 'ams', 'newcommand', 'configmacros'],
      ...(Object.keys(macros).length > 0 ? { macros } : {}),
    });
    const svg = new SVG({ fontCache: 'none' });
    const html = MathJax.document('', { InputJax: tex, OutputJax: svg });

    const node = html.convert(texString, { display: displayMode });
    svgString = adaptor.outerHTML(node as LiteElement);

    // Parse the string into a real SVGElement for downstream use
    if (typeof DOMParser === 'undefined') {
      // Headless / no-DOM environment — create a minimal stub SVGElement
      svgElement = {
        getAttribute: () => null,
        setAttribute: () => {},
        querySelectorAll: () => [],
      } as unknown as SVGElement;
    } else {
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgString, 'image/svg+xml');
      // @mathjax/src wraps SVG in <mjx-container>; extract the inner <svg>
      const innerSvg = doc.querySelector('svg');
      svgElement = (innerSvg || doc.documentElement) as unknown as SVGElement;
      if (!svgElement || !('tagName' in svgElement)) {
        // Create a fallback stub
        svgElement = {
          getAttribute: () => null,
          setAttribute: () => {},
          querySelectorAll: () => [],
        } as unknown as SVGElement;
      }
    }
  }

  // ------------------------------------------------------------------
  // Apply color & scale
  // ------------------------------------------------------------------
  svgElement.setAttribute('color', color);
  svgElement.setAttribute('style', `color:${color};`);

  // Replace currentColor in all shapes
  const shapes = svgElement.querySelectorAll('path, line, rect, circle, polyline, polygon, use');
  shapes.forEach((el) => {
    const fill = el.getAttribute('fill');
    if (!fill || fill === 'currentColor' || fill === 'inherit') {
      el.setAttribute('fill', color);
    }
    const stroke = el.getAttribute('stroke');
    if (stroke === 'currentColor' || stroke === 'inherit') {
      el.setAttribute('stroke', color);
    }
  });

  // Read dimensions from the SVG viewBox (MathJax always sets one)
  const viewBox = svgElement.getAttribute('viewBox');
  let width = 0;
  let height = 0;
  if (viewBox) {
    const parts = viewBox.split(/\s+/);
    width = parseFloat(parts[2]) || 0;
    height = parseFloat(parts[3]) || 0;
  }

  // ------------------------------------------------------------------
  // Convert SVG paths to VMobjects
  // ------------------------------------------------------------------
  if (!('tagName' in svgElement)) {
    throw new Error('svgElement has no tagName');
  }
  const vmobjectGroup = svgToVMobjects(svgElement, {
    color,
    scale: 1,
    flipY: false,
    strokeWidth: 0.02,
    fillOpacity: 1,
  });

  return {
    svgElement,
    vmobjectGroup,
    svgString,
    width,
    height,
  };
}

/**
 * Quick check: can KaTeX render this LaTeX string without throwing?
 * Used by the 'auto' renderer mode to decide whether to fall back to MathJax.
 */
export function katexCanRender(texString: string, displayMode = true): boolean {
  try {
    katex.renderToString(texString, {
      displayMode,
      throwOnError: true,
      output: 'html',
    });
    return true;
  } catch {
    return false;
  }
}
