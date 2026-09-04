// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';

describe('text asset configuration', () => {
  afterEach(() => {
    vi.doUnmock('./MathJaxBundle.js');
    vi.resetModules();
    document.head.replaceChildren();
  });

  it('allows applications that bundle KaTeX CSS to disable stylesheet injection', async () => {
    vi.resetModules();
    const styles = await import('./katexStyles');

    styles.setKatexStylesheetUrl(null);
    styles.ensureKatexStyles();
    await styles.waitForKatexStyles();

    expect(document.getElementById('manimweb-katex-styles')).toBeNull();
    expect(styles.areKatexStylesLoaded()).toBe(true);
  });

  it('allows applications to disable MathJax script fallback', async () => {
    vi.resetModules();
    vi.doMock('./MathJaxBundle.js', () => {
      throw new Error('simulated module load failure');
    });
    const renderer = await import('./MathJaxRenderer');

    renderer.setMathJaxScriptUrl(null);

    await expect(renderer.preloadMathJax()).rejects.toThrow(
      'MathJax npm modules failed and the script fallback is disabled',
    );
    expect(document.querySelector('script[src*="mathjax"]')).toBeNull();
  });
});
