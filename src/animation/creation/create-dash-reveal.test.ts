// @vitest-environment happy-dom
/**
 * Regression tests for the Create() dash-reveal "phantom dot" fix.
 *
 * Three.js's LineMaterial dashed-line discard test degenerates at
 * dashSize=0 (its own `// todo - FIX` comment on the discard line in
 * LineMaterial.js's fragment shader), leaving a stray fragment visible near
 * a not-yet-revealed line's start anchor. setLine2RevealLength() sidesteps
 * this by toggling Line2.visible instead of relying on dashSize=0 to mean
 * "nothing shown". These tests exercise the real Line2/LineMaterial objects
 * (hence @vitest-environment happy-dom, matching transform.test.ts's
 * precedent -- creation-coverage.test.ts intentionally avoids Line2 and
 * uses the opacity-fallback path instead).
 */
import { describe, it, expect } from 'vitest';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { Circle } from '../../mobjects/geometry/Circle';
import { DashedLine } from '../../mobjects/geometry/DashedLine';
import { Create, setLine2RevealLength, Uncreate, DrawBorderThenFill } from './Create';

function allLine2(mob: { getThreeObject(): import('three').Object3D }): Line2[] {
  const found: Line2[] = [];
  mob.getThreeObject().traverse((child) => {
    if (child instanceof Line2) found.push(child);
  });
  return found;
}

describe('setLine2RevealLength', () => {
  function makeLine2(): Line2 {
    // A minimal real Line2 -- geometry content doesn't matter for this unit,
    // only the material's dashSize/gapSize/visible state.
    const circle = new Circle({ radius: 1 });
    const lines = allLine2(circle);
    expect(lines.length).toBeGreaterThan(0);
    return lines[0];
  }

  it('hides the line entirely when nothing is revealed (visibleLength=0)', () => {
    const line = makeLine2();
    setLine2RevealLength(line, 0, 5);
    expect(line.visible).toBe(false);
  });

  it('shows the line and sets dash/gap sizes once something is revealed', () => {
    const line = makeLine2();
    setLine2RevealLength(line, 2, 5);
    expect(line.visible).toBe(true);
    const material = line.material as LineMaterial;
    expect(material.dashSize).toBe(2);
    expect(material.gapSize).toBeCloseTo(3.0001, 4);
  });

  it('re-shows a previously hidden line once revealed', () => {
    const line = makeLine2();
    setLine2RevealLength(line, 0, 5);
    expect(line.visible).toBe(false);
    setLine2RevealLength(line, 5, 5);
    expect(line.visible).toBe(true);
  });
});

describe('Create() no longer leaves a phantom dot on unrevealed dashes (issue: DashedLine visual audit)', () => {
  it('hides every dash at alpha=0, not just the ones past their reveal window', () => {
    const dashed = new DashedLine({
      start: [-2, 0, 0],
      end: [2, 0, 0],
      dashLength: 0.3,
    });
    const anim = new Create(dashed, { duration: 1 });
    anim.begin();
    anim.interpolate(0);

    const lines = allLine2(dashed);
    expect(lines.length).toBe(dashed.getDashes().length);
    for (const line of lines) {
      expect(line.visible).toBe(false);
    }
  });

  it('reveals only the dashes whose window has started, hiding the rest', () => {
    const dashed = new DashedLine({
      start: [-2, 0, 0],
      end: [2, 0, 0],
      dashLength: 0.3,
    });
    const anim = new Create(dashed, { duration: 1 });
    anim.begin();

    const n = dashed.getDashes().length;
    // Halfway through dash 0's own window: dash 0 partially visible, every
    // other dash still fully hidden (not a phantom dot).
    anim.interpolate(0.5 / n);

    const dashLines = dashed.getDashes().map((d) => allLine2(d)[0]);
    expect(dashLines[0].visible).toBe(true);
    for (let i = 1; i < dashLines.length; i++) {
      expect(dashLines[i].visible).toBe(false);
    }
  });

  it('shows every dash once Create() finishes', () => {
    const dashed = new DashedLine({
      start: [-2, 0, 0],
      end: [2, 0, 0],
      dashLength: 0.3,
    });
    const anim = new Create(dashed, { duration: 1 });
    anim.begin();
    anim.interpolate(1);
    anim.finish();

    for (const line of allLine2(dashed)) {
      expect(line.visible).toBe(true);
    }
  });

  it('hides a plain (single-Line2) shape at alpha=0 too, not just DashedLine', () => {
    const circle = new Circle({ radius: 1 });
    const anim = new Create(circle, { duration: 1 });
    anim.begin();
    anim.interpolate(0);
    for (const line of allLine2(circle)) {
      expect(line.visible).toBe(false);
    }
  });
});

describe('Uncreate() hides the stroke once fully erased', () => {
  it('hides every line at alpha=1 and after finish()', () => {
    const dashed = new DashedLine({
      start: [-2, 0, 0],
      end: [2, 0, 0],
      dashLength: 0.3,
    });
    const anim = new Uncreate(dashed, { duration: 1 });
    anim.begin();
    anim.interpolate(1);
    for (const line of allLine2(dashed)) {
      expect(line.visible).toBe(false);
    }
    anim.finish();
    for (const line of allLine2(dashed)) {
      expect(line.visible).toBe(false);
    }
  });

  it('starts fully visible at alpha=0', () => {
    const dashed = new DashedLine({
      start: [-2, 0, 0],
      end: [2, 0, 0],
      dashLength: 0.3,
    });
    const anim = new Uncreate(dashed, { duration: 1 });
    anim.begin();
    for (const line of allLine2(dashed)) {
      expect(line.visible).toBe(true);
    }
  });
});

describe('DrawBorderThenFill() hides the border at alpha=0', () => {
  it('starts with every Line2 hidden', () => {
    const circle = new Circle({ radius: 1, fillOpacity: 0.5 });
    const anim = new DrawBorderThenFill(circle, { duration: 1 });
    anim.begin();
    for (const line of allLine2(circle)) {
      expect(line.visible).toBe(false);
    }
  });
});
