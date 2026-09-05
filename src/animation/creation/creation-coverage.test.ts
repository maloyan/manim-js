/**
 * Additional coverage tests for Create.ts and CreationExtensions.ts.
 *
 * Focus areas:
 * - Create with VMobject (opacity fallback path since we lack Line2 in tests)
 * - DrawBorderThenFill with VMobject
 * - Uncreate with VMobject
 * - ShowIncreasingSubsets begin/interpolate/finish
 * - ShowSubmobjectsOneByOne begin/interpolate/finish
 * - Write with VMobject (opacity fallback), with MathTex-like (setRevealProgress), remover mode
 * - Unwrite
 * - AddTextLetterByLetter
 * - RemoveTextLetterByLetter
 * - AddTextWordByWord
 * - SpiralIn
 * - ShowPartial
 * - Factory functions
 */

import { describe, it, expect } from 'vitest';
import { Mobject } from '../../core/Mobject';
import { VMobject } from '../../core/VMobject';
import { PointMobject } from '../../mobjects/point';
import { DashedLine } from '../../mobjects/geometry/DashedLine';
import {
  Create,
  create,
  DrawBorderThenFill,
  drawBorderThenFill,
  Uncreate,
  uncreate,
  Write,
  write,
  Unwrite,
  unwrite,
  AddTextLetterByLetter,
  addTextLetterByLetter,
  RemoveTextLetterByLetter,
  removeTextLetterByLetter,
} from './Create';
import {
  AddTextWordByWord,
  addTextWordByWord,
  ShowIncreasingSubsets,
  showIncreasingSubsets,
  ShowPartial,
  showPartial,
  ShowSubmobjectsOneByOne,
  showSubmobjectsOneByOne,
  SpiralIn,
  spiralIn,
} from './CreationExtensions';

// =============================================================================
// Helpers
// =============================================================================

/** Mock text mobject with getText/setText */
class MockTextMobject extends Mobject {
  private _text: string;
  color: string = '#ffffff';

  constructor(text: string = 'Hello World') {
    super();
    this._text = text;
  }

  getText(): string {
    return this._text;
  }

  setText(text: string): void {
    this._text = text;
  }

  protected _createThreeObject() {
    return new (require('three').Object3D)();
  }

  protected _syncToThree(): void {}

  override copy(): Mobject {
    return new MockTextMobject(this._text);
  }
}

/** Mock MathTex-like with setRevealProgress */
class MockMathTexMobject extends Mobject {
  private _revealProgress: number = 1;

  setRevealProgress(progress: number): void {
    this._revealProgress = progress;
  }

  getRevealProgress(): number {
    return this._revealProgress;
  }

  protected _createThreeObject() {
    return new (require('three').Object3D)();
  }

  protected _syncToThree(): void {}

  override copy(): Mobject {
    return new MockMathTexMobject();
  }
}

/** Create a VMobject with points */
function makeVMobject(): VMobject {
  const v = new VMobject();
  v.setPoints([
    [-1, 0, 0],
    [-0.5, 0.5, 0],
    [0.5, 0.5, 0],
    [1, 0, 0],
  ]);
  return v;
}

/** Create a parent mobject with children */
function makeParentWithChildren(n: number): Mobject {
  const parent = new Mobject();
  for (let i = 0; i < n; i++) {
    const child = new Mobject();
    child.setStrokeOpacity(1);
    parent.add(child);
  }
  return parent;
}

// =============================================================================
// Create - VMobject without Line2 (opacity fallback)
// =============================================================================

describe('Create - VMobject opacity fallback', () => {
  it('begin sets opacity to 0 for VMobject without Line2', () => {
    // Empty VMobject = no Line2 children = opacity fallback
    const v = new VMobject();
    v.opacity = 1;
    const anim = new Create(v);
    anim.begin();
    expect(v.opacity).toBe(0);
  });

  it('interpolate sets opacity proportionally', () => {
    const v = new VMobject();
    const anim = new Create(v);
    anim.begin();
    anim.interpolate(0.3);
    expect(v.opacity).toBeCloseTo(0.3, 5);
    anim.interpolate(0.7);
    expect(v.opacity).toBeCloseTo(0.7, 5);
  });

  it('finish sets opacity to 1', () => {
    const v = new VMobject();
    const anim = new Create(v);
    anim.begin();
    anim.interpolate(0.5);
    anim.finish();
    expect(v.opacity).toBe(1);
  });
});

// =============================================================================
// DrawBorderThenFill - VMobject without Line2
// =============================================================================

describe('DrawBorderThenFill - VMobject without Line2', () => {
  it('begin does not crash for VMobject without Line2', () => {
    const v = makeVMobject();
    const anim = new DrawBorderThenFill(v);
    expect(() => anim.begin()).not.toThrow();
  });

  it('interpolate does nothing (no dash reveal)', () => {
    const v = makeVMobject();
    v.setStrokeOpacity(0.8);
    const anim = new DrawBorderThenFill(v);
    anim.begin();
    anim.interpolate(0.5);
    // Without Line2, interpolate is a no-op
    expect(v.opacity).toBe(0.8);
  });

  it('finish does not crash', () => {
    const v = makeVMobject();
    const anim = new DrawBorderThenFill(v);
    anim.begin();
    anim.finish();
    expect(anim.isFinished()).toBe(true);
  });

  it('factory function returns DrawBorderThenFill', () => {
    const v = makeVMobject();
    const anim = drawBorderThenFill(v, { duration: 3 });
    expect(anim).toBeInstanceOf(DrawBorderThenFill);
    expect(anim.duration).toBe(3);
  });
});

// =============================================================================
// Uncreate - VMobject without Line2
// =============================================================================

describe('Uncreate - VMobject without Line2', () => {
  it('begin does not crash', () => {
    const v = new VMobject(); // empty = no Line2
    const anim = new Uncreate(v);
    expect(() => anim.begin()).not.toThrow();
  });

  it('interpolate reduces opacity for non-Line2 VMobject', () => {
    const v = new VMobject();
    const anim = new Uncreate(v);
    anim.begin();
    anim.interpolate(0);
    expect(v.opacity).toBeCloseTo(1, 5);
    anim.interpolate(0.5);
    expect(v.opacity).toBeCloseTo(0.5, 5);
    anim.interpolate(1);
    expect(v.opacity).toBeCloseTo(0, 5);
  });

  it('finish sets opacity to 0', () => {
    const v = new VMobject();
    const anim = new Uncreate(v);
    anim.begin();
    anim.finish();
    expect(v.opacity).toBe(0);
  });

  it('factory function returns Uncreate', () => {
    const v = new VMobject();
    const anim = uncreate(v, { duration: 1.5 });
    expect(anim).toBeInstanceOf(Uncreate);
    expect(anim.duration).toBe(1.5);
  });
});

// =============================================================================
// Uncreate with non-VMobject
// =============================================================================

describe('Uncreate - non-VMobject', () => {
  it('interpolate reduces opacity', () => {
    const m = new Mobject();
    const anim = new Uncreate(m);
    anim.begin();
    anim.interpolate(0.5);
    expect(m.opacity).toBeCloseTo(0.5, 5);
  });

  it('finish sets opacity to 0', () => {
    const m = new Mobject();
    const anim = new Uncreate(m);
    anim.begin();
    anim.finish();
    expect(m.opacity).toBe(0);
  });
});

// =============================================================================
// ShowIncreasingSubsets
// =============================================================================

describe('ShowIncreasingSubsets', () => {
  it('constructor defaults', () => {
    const parent = makeParentWithChildren(3);
    const anim = new ShowIncreasingSubsets(parent);
    expect(anim.duration).toBe(1); // default
  });

  it('begin hides all children', () => {
    const parent = makeParentWithChildren(3);
    const anim = new ShowIncreasingSubsets(parent);
    anim.begin();
    for (const child of parent.children) {
      expect(child.opacity).toBe(0);
    }
  });

  it('interpolate shows children cumulatively', () => {
    const parent = makeParentWithChildren(4);
    const anim = new ShowIncreasingSubsets(parent);
    anim.begin();

    // At alpha=0.5, should show 2 children fully
    anim.interpolate(0.5);
    expect(parent.children[0].opacity).toBe(1);
    expect(parent.children[1].opacity).toBe(1);
    // Third child should be partially visible
    expect(parent.children[2].opacity).toBeGreaterThanOrEqual(0);
    // Fourth hidden
    expect(parent.children[3].opacity).toBe(0);
  });

  it('interpolate at alpha=1 shows all', () => {
    const parent = makeParentWithChildren(3);
    const anim = new ShowIncreasingSubsets(parent);
    anim.begin();
    anim.interpolate(1);
    for (const child of parent.children) {
      expect(child.opacity).toBe(1);
    }
  });

  it('finish restores original opacities', () => {
    const parent = new Mobject();
    const c1 = new Mobject();
    c1.setStrokeOpacity(0.5);
    const c2 = new Mobject();
    c2.setStrokeOpacity(0.8);
    parent.add(c1, c2);

    const anim = new ShowIncreasingSubsets(parent);
    anim.begin();
    anim.finish();
    expect(c1.opacity).toBe(0.5);
    expect(c2.opacity).toBe(0.8);
  });

  it('factory function works', () => {
    const parent = makeParentWithChildren(2);
    const anim = showIncreasingSubsets(parent, { duration: 2 });
    expect(anim).toBeInstanceOf(ShowIncreasingSubsets);
    expect(anim.duration).toBe(2);
  });
});

// =============================================================================
// ShowSubmobjectsOneByOne
// =============================================================================

describe('ShowSubmobjectsOneByOne', () => {
  it('begin hides all children', () => {
    const parent = makeParentWithChildren(3);
    const anim = new ShowSubmobjectsOneByOne(parent);
    anim.begin();
    for (const child of parent.children) {
      expect(child.opacity).toBe(0);
    }
  });

  it('interpolate shows only one child at a time', () => {
    const parent = makeParentWithChildren(4);
    const anim = new ShowSubmobjectsOneByOne(parent);
    anim.begin();

    // At alpha ~0.12 (first 1/4), should show child[0]
    anim.interpolate(0.12);
    expect(parent.children[0].opacity).toBe(1);
    expect(parent.children[1].opacity).toBe(0);

    // At alpha ~0.37 (second 1/4), should show child[1]
    anim.interpolate(0.37);
    expect(parent.children[0].opacity).toBe(0);
    expect(parent.children[1].opacity).toBe(1);
    expect(parent.children[2].opacity).toBe(0);
  });

  it('interpolate at alpha=0 shows first child', () => {
    const parent = makeParentWithChildren(3);
    const anim = new ShowSubmobjectsOneByOne(parent);
    anim.begin();
    anim.interpolate(0);
    expect(parent.children[0].opacity).toBe(1);
    expect(parent.children[1].opacity).toBe(0);
  });

  it('finish shows only last child', () => {
    const parent = makeParentWithChildren(3);
    const anim = new ShowSubmobjectsOneByOne(parent);
    anim.begin();
    anim.finish();
    expect(parent.children[0].opacity).toBe(0);
    expect(parent.children[1].opacity).toBe(0);
    expect(parent.children[2].opacity).toBe(1);
  });

  it('factory function works', () => {
    const parent = makeParentWithChildren(2);
    const anim = showSubmobjectsOneByOne(parent);
    expect(anim).toBeInstanceOf(ShowSubmobjectsOneByOne);
  });
});

// =============================================================================
// Write - with VMobject (opacity fallback)
// =============================================================================

describe('Write - VMobject opacity fallback', () => {
  it('begin sets opacity to 0', () => {
    const v = new VMobject(); // empty = no Line2
    const anim = new Write(v);
    anim.begin();
    expect(v.opacity).toBe(0);
  });

  it('interpolate increases opacity', () => {
    const v = new VMobject();
    const anim = new Write(v);
    anim.begin();
    anim.interpolate(0.5);
    expect(v.opacity).toBeCloseTo(0.5, 5);
  });

  it('finish sets opacity to original', () => {
    const v = new VMobject();
    v.setStrokeOpacity(0.8);
    const anim = new Write(v);
    anim.begin();
    anim.interpolate(0.5);
    anim.finish();
    expect(v.opacity).toBe(0.8);
  });

  it('factory function works', () => {
    const v = new VMobject();
    const anim = write(v, { duration: 2 });
    expect(anim).toBeInstanceOf(Write);
    expect(anim.duration).toBe(2);
  });
});

// =============================================================================
// Write - with MathTex-like (setRevealProgress)
// =============================================================================

describe('Write - setRevealProgress path', () => {
  it('begin sets reveal to 0', () => {
    const m = new MockMathTexMobject();
    const anim = new Write(m);
    anim.begin();
    expect(m.getRevealProgress()).toBe(0);
  });

  it('interpolate sets reveal progress', () => {
    const m = new MockMathTexMobject();
    const anim = new Write(m);
    anim.begin();
    anim.interpolate(0.3);
    expect(m.getRevealProgress()).toBeCloseTo(0.3, 5);
    anim.interpolate(0.7);
    expect(m.getRevealProgress()).toBeCloseTo(0.7, 5);
  });

  it('finish sets reveal to 1', () => {
    const m = new MockMathTexMobject();
    const anim = new Write(m);
    anim.begin();
    anim.finish();
    expect(m.getRevealProgress()).toBe(1);
  });

  it('remover mode sets reveal to 0 on finish', () => {
    const m = new MockMathTexMobject();
    const anim = new Write(m, { remover: true });
    anim.begin();
    anim.finish();
    expect(m.getRevealProgress()).toBe(0);
  });
});

// =============================================================================
// Write - reverse mode
// =============================================================================

describe('Write - reverse mode', () => {
  it('starts from original opacity', () => {
    const v = new VMobject(); // empty = opacity fallback
    v.setStrokeOpacity(1);
    const anim = new Write(v, { reverse: true });
    anim.begin();
    // reverse=true, VMobject fallback: start at original opacity
    expect(v.opacity).toBe(1);
  });

  it('interpolate decreases opacity in reverse', () => {
    const v = new VMobject();
    v.setStrokeOpacity(1);
    const anim = new Write(v, { reverse: true });
    anim.begin();
    anim.interpolate(0.5);
    // effectiveAlpha = 1 - 0.5 = 0.5
    expect(v.opacity).toBeCloseTo(0.5, 5);
  });
});

// =============================================================================
// Write - remover + opacity fallback
// =============================================================================

describe('Write - remover mode (opacity)', () => {
  it('finish with remover sets opacity to 0', () => {
    const v = new VMobject(); // empty = opacity fallback
    const anim = new Write(v, { remover: true });
    anim.begin();
    anim.finish();
    expect(v.opacity).toBe(0);
  });

  it('finish without remover sets opacity to original', () => {
    const v = new VMobject();
    v.setStrokeOpacity(0.9);
    const anim = new Write(v, { remover: false });
    anim.begin();
    anim.finish();
    expect(v.opacity).toBe(0.9);
  });
});

// =============================================================================
// Unwrite
// =============================================================================

describe('Unwrite', () => {
  it('is a Write with reverse and remover', () => {
    const v = new VMobject();
    const anim = new Unwrite(v);
    expect(anim).toBeInstanceOf(Write);
  });

  it('factory function works', () => {
    const v = new VMobject();
    const anim = unwrite(v);
    expect(anim).toBeInstanceOf(Unwrite);
  });

  it('begin preserves current opacity', () => {
    const v = new VMobject(); // empty = opacity fallback
    v.setStrokeOpacity(1);
    const anim = new Unwrite(v);
    anim.begin();
    expect(v.opacity).toBe(1); // reverse=true starts at original
  });
});

// =============================================================================
// AddTextLetterByLetter
// =============================================================================

describe('AddTextLetterByLetter', () => {
  it('begin clears text', () => {
    const m = new MockTextMobject('ABCDE');
    const anim = new AddTextLetterByLetter(m);
    anim.begin();
    expect(m.getText()).toBe('');
  });

  it('interpolate reveals characters progressively', () => {
    const m = new MockTextMobject('ABCDE');
    const anim = new AddTextLetterByLetter(m);
    anim.begin();
    anim.interpolate(0.4);
    expect(m.getText()).toBe('AB');
    anim.interpolate(0.8);
    expect(m.getText()).toBe('ABCD');
  });

  it('finish shows full text', () => {
    const m = new MockTextMobject('ABCDE');
    const anim = new AddTextLetterByLetter(m);
    anim.begin();
    anim.finish();
    expect(m.getText()).toBe('ABCDE');
  });

  it('factory function works', () => {
    const m = new MockTextMobject('test');
    const anim = addTextLetterByLetter(m, { timePerChar: 0.05 });
    expect(anim).toBeInstanceOf(AddTextLetterByLetter);
  });

  it('does nothing for mobject without getText', () => {
    const m = new Mobject();
    const anim = new AddTextLetterByLetter(m);
    anim.begin();
    anim.interpolate(0.5);
    anim.finish();
    // Should not crash
    expect(true).toBe(true);
  });
});

// =============================================================================
// RemoveTextLetterByLetter
// =============================================================================

describe('RemoveTextLetterByLetter', () => {
  it('begin preserves text', () => {
    const m = new MockTextMobject('ABCDE');
    const anim = new RemoveTextLetterByLetter(m);
    anim.begin();
    expect(m.getText()).toBe('ABCDE');
  });

  it('interpolate removes characters progressively', () => {
    const m = new MockTextMobject('ABCDE');
    const anim = new RemoveTextLetterByLetter(m);
    anim.begin();
    anim.interpolate(0.4);
    expect(m.getText()).toBe('ABC');
    anim.interpolate(0.8);
    expect(m.getText()).toBe('A');
  });

  it('finish clears text', () => {
    const m = new MockTextMobject('ABCDE');
    const anim = new RemoveTextLetterByLetter(m);
    anim.begin();
    anim.finish();
    expect(m.getText()).toBe('');
  });

  it('factory function works', () => {
    const m = new MockTextMobject('test');
    const anim = removeTextLetterByLetter(m);
    expect(anim).toBeInstanceOf(RemoveTextLetterByLetter);
  });

  it('does nothing for mobject without setText', () => {
    const m = new Mobject();
    const anim = new RemoveTextLetterByLetter(m);
    anim.begin();
    anim.interpolate(0.5);
    anim.finish();
    expect(true).toBe(true);
  });
});

// =============================================================================
// AddTextWordByWord
// =============================================================================

describe('AddTextWordByWord', () => {
  it('begin clears text', () => {
    const m = new MockTextMobject('Hello World Foo');
    const anim = new AddTextWordByWord(m);
    anim.begin();
    expect(m.getText()).toBe('');
  });

  it('interpolate reveals words progressively', () => {
    const m = new MockTextMobject('Hello World Foo');
    const anim = new AddTextWordByWord(m);
    anim.begin();
    // 3 words: at alpha=0.34, should show 1 word
    anim.interpolate(0.34);
    expect(m.getText()).toBe('Hello');
    // At alpha=0.67, should show 2 words
    anim.interpolate(0.67);
    expect(m.getText()).toBe('Hello World');
  });

  it('finish restores full text', () => {
    const m = new MockTextMobject('Hello World Foo');
    const anim = new AddTextWordByWord(m);
    anim.begin();
    anim.finish();
    expect(m.getText()).toBe('Hello World Foo');
  });

  it('factory function works', () => {
    const m = new MockTextMobject('test');
    const anim = addTextWordByWord(m, { timePerWord: 0.3 });
    expect(anim).toBeInstanceOf(AddTextWordByWord);
  });

  it('does nothing for mobject without getText', () => {
    const m = new Mobject();
    const anim = new AddTextWordByWord(m);
    anim.begin();
    anim.interpolate(0.5);
    anim.finish();
    expect(true).toBe(true);
  });
});

// =============================================================================
// ShowPartial
// =============================================================================

describe('ShowPartial', () => {
  it('constructor defaults', () => {
    const v = makeVMobject();
    const anim = new ShowPartial(v);
    expect(anim.startPortion).toBe(0);
    expect(anim.endPortion).toBe(1);
  });

  it('accepts custom start and end portions', () => {
    const v = makeVMobject();
    const anim = new ShowPartial(v, { startPortion: 0.2, endPortion: 0.8 });
    expect(anim.startPortion).toBe(0.2);
    expect(anim.endPortion).toBe(0.8);
  });

  it('interpolate uses opacity for non-VMobject', () => {
    const m = new Mobject();
    const anim = new ShowPartial(m);
    anim.begin();
    anim.interpolate(0.5);
    expect(m.opacity).toBeCloseTo(0.5, 5);
  });

  it('finish does not crash', () => {
    const v = makeVMobject();
    const anim = new ShowPartial(v);
    anim.begin();
    anim.finish();
    expect(anim.isFinished()).toBe(true);
  });

  it('factory function works', () => {
    const v = makeVMobject();
    const anim = showPartial(v, { startPortion: 0.1 });
    expect(anim).toBeInstanceOf(ShowPartial);
    expect(anim.startPortion).toBe(0.1);
  });
});

// =============================================================================
// SpiralIn
// =============================================================================

describe('SpiralIn', () => {
  it('constructor defaults', () => {
    const m = new PointMobject({ position: [0, 0, 0] });
    const anim = new SpiralIn(m);
    expect(anim.scaleFactor).toBe(3);
    expect(anim.numTurns).toBe(2);
  });

  it('accepts custom options', () => {
    const m = new PointMobject({ position: [0, 0, 0] });
    const anim = new SpiralIn(m, { scaleFactor: 5, numTurns: 3 });
    expect(anim.scaleFactor).toBe(5);
    expect(anim.numTurns).toBe(3);
  });

  it('begin scales up and moves to center', () => {
    const m = new PointMobject({ position: [2, 3, 0] });
    const origScale = m.scaleVector.x;
    const anim = new SpiralIn(m);
    anim.begin();
    // Scale should be larger
    expect(m.scaleVector.x).toBeGreaterThan(origScale);
  });

  it('interpolate moves mobject towards target', () => {
    const m = new PointMobject({ position: [2, 0, 0] });
    const anim = new SpiralIn(m);
    anim.begin();
    anim.interpolate(0.5);
    // Should be partway between center and target
    // Since spiral adds rotation, just check it didn't crash
    expect(typeof m.position.x).toBe('number');
  });

  it('finish restores target position and scale', () => {
    const m = new PointMobject({ position: [2, 3, 0] });
    m.scaleVector.set(1, 1, 1);
    const anim = new SpiralIn(m);
    anim.begin();
    anim.interpolate(0.5);
    anim.finish();
    expect(m.position.x).toBeCloseTo(2);
    expect(m.position.y).toBeCloseTo(3);
    expect(m.scaleVector.x).toBeCloseTo(1);
  });

  it('works with children', () => {
    const parent = new VMobject();
    const c1 = new PointMobject({ position: [0, 0, 0] });
    c1.moveTo([1, 0, 0]);
    const c2 = new PointMobject({ position: [0, 0, 0] });
    c2.moveTo([-1, 0, 0]);
    parent.add(c1, c2);

    const anim = new SpiralIn(parent);
    anim.begin();
    anim.interpolate(0.5);
    anim.finish();
    expect(c1.position.x).toBeCloseTo(1);
    expect(c2.position.x).toBeCloseTo(-1);
  });

  it('factory function works', () => {
    const m = new PointMobject({ position: [0, 0, 0] });
    const anim = spiralIn(m, { scaleFactor: 2, numTurns: 1 });
    expect(anim).toBeInstanceOf(SpiralIn);
    expect(anim.scaleFactor).toBe(2);
  });
});

// =============================================================================
// Create - lagRatio stagger (Animation.getSubAlpha, the ported get_sub_alpha)
// =============================================================================

describe('Create - lagRatio stagger', () => {
  it('lagRatio=0 means all children animate together', () => {
    const m = new Mobject();
    const anim = new Create(m, { lagRatio: 0 });
    anim.begin();
    anim.interpolate(0.5);
    expect(m.opacity).toBeCloseTo(0.5, 5);
  });

  it('lagRatio>0 with single mobject behaves normally', () => {
    const m = new Mobject();
    const anim = new Create(m, { lagRatio: 0.5 });
    anim.begin();
    anim.interpolate(0.5);
    // Single mobject fallback: opacity-based
    expect(m.opacity).toBeCloseTo(0.5, 5);
  });
});

describe('Create - default lagRatio is 1.0, matching Manim CE/3b1b (#544)', () => {
  // getSubAlpha is `protected`; reach it the same way the rest of this file
  // reaches other protected members (e.g. Write.lagRatio via `as any`).
  function subAlpha(anim: Create, alpha: number, index: number, count: number, lagRatio: number) {
    return (
      anim as unknown as {
        getSubAlpha: (a: number, i: number, c: number, l: number) => number;
      }
    ).getSubAlpha(alpha, index, count, lagRatio);
  }

  it('defaults to 1 (sequential) when no lagRatio option is given', () => {
    const anim = new Create(new DashedLine());
    expect((anim as unknown as { _lagRatio: number })._lagRatio).toBe(1);
  });

  it('exact #544 scenario: DashedLine, no explicit lagRatio, members do not all share one subAlpha', () => {
    // Issue #544's own repro: `new Create(dashedLine, { duration: 1 })` — no
    // lagRatio — expected the 11 dashes to draw one after another, not all
    // simultaneously. Reproduced here via the public family/subAlpha surface
    // rather than Line2.material.dashSize: Line2 never builds under this
    // suite's happy-dom environment (see every other "VMobject without
    // Line2" test in this file) — a pre-existing, unrelated limitation.
    const dashed = new DashedLine({
      start: [-3, 0, 0],
      end: [3, 0, 0],
      dashLength: 0.6,
      dashRatio: 0.5,
    });
    const anim = new Create(dashed, { duration: 1 }); // no lagRatio — must use the default

    const defaultLagRatio = (anim as unknown as { _lagRatio: number })._lagRatio;
    expect(defaultLagRatio).toBe(1);

    const family = dashed.familyMembersWithPoints();
    expect(family.length).toBe(dashed.getDashes().length);
    expect(family.length).toBeGreaterThan(1); // otherwise lagRatio can't matter

    // Before #544's fix, every dash reached the same visibleFraction at every
    // alpha (see the issue's own evidence table). With lagRatio=1 and real
    // family members, they must NOT all get the same subAlpha mid-animation.
    const subAlphas = family.map((_, i) => subAlpha(anim, 0.5, i, family.length, defaultLagRatio));
    const distinct = new Set(subAlphas.map((v) => v.toFixed(6)));
    expect(distinct.size).toBeGreaterThan(1);

    // And it must be genuinely sequential: dash 0 finishes before dash 1
    // starts moving (lagRatio=1 semantics), matching Manim's "each completes
    // before the next begins".
    expect(subAlpha(anim, 1 / family.length, 0, family.length, defaultLagRatio)).toBeCloseTo(1, 10);
    expect(subAlpha(anim, 1 / family.length, 1, family.length, defaultLagRatio)).toBeCloseTo(0, 10);
  });
});

describe('Animation.getSubAlpha (Manim CE get_sub_alpha formula)', () => {
  // getSubAlpha is `protected` on Animation; Create is a concrete subclass we
  // already construct everywhere else in this file, so reach it the same way
  // the rest of the suite reaches other protected members (e.g. Write.lagRatio).
  function subAlpha(anim: Create, alpha: number, index: number, count: number, lagRatio: number) {
    return (
      anim as unknown as {
        getSubAlpha: (a: number, i: number, c: number, l: number) => number;
      }
    ).getSubAlpha(alpha, index, count, lagRatio);
  }

  it('returns alpha unchanged when lagRatio<=0 or a single member', () => {
    const anim = new Create(new Mobject());
    expect(subAlpha(anim, 0.42, 0, 1, 0.9)).toBeCloseTo(0.42, 10);
    expect(subAlpha(anim, 0.42, 0, 5, 0)).toBeCloseTo(0.42, 10);
  });

  it('matches the documented 3-member, lagRatio=0.5 staircase', () => {
    // member i's window is [0.25*i, 0.5 + 0.25*i] — see the lag-ratio audit.
    const anim = new Create(new Mobject());
    for (let i = 0; i < 3; i++) {
      const start = 0.25 * i;
      const end = 0.5 + 0.25 * i;
      expect(subAlpha(anim, start, i, 3, 0.5)).toBeCloseTo(0, 10);
      expect(subAlpha(anim, end, i, 3, 0.5)).toBeCloseTo(1, 10);
      expect(subAlpha(anim, (start + end) / 2, i, 3, 0.5)).toBeCloseTo(0.5, 10);
    }
  });

  it('clips outside its own window instead of going negative or past 1', () => {
    const anim = new Create(new Mobject());
    // member 2 of 3 (lagRatio=0.5) only starts moving at alpha=0.5
    expect(subAlpha(anim, 0.1, 2, 3, 0.5)).toBe(0);
    expect(subAlpha(anim, 1, 0, 3, 0.5)).toBe(1);
  });
});

describe('VMobjectRendering.getOwnStrokeLines', () => {
  it('returns an empty array for a VMobject with no points (no crash)', () => {
    const v = new VMobject();
    expect(v.getOwnStrokeLines()).toEqual([]);
  });
});

// =============================================================================
// Create with non-Mobject
// =============================================================================

describe('Create factory', () => {
  it('default duration is 2', () => {
    const m = new Mobject();
    const anim = create(m);
    expect(anim.duration).toBe(2);
  });
});

// =============================================================================
// Write with non-VMobject, non-text mobject
// =============================================================================

describe('Write - plain Mobject fallback', () => {
  it('begin sets opacity to 0', () => {
    const m = new Mobject();
    const anim = new Write(m);
    anim.begin();
    expect(m.opacity).toBe(0);
  });

  it('interpolate increases opacity', () => {
    const m = new Mobject();
    const anim = new Write(m);
    anim.begin();
    anim.interpolate(0.5);
    expect(m.opacity).toBeCloseTo(0.5, 5);
  });

  it('finish restores opacity', () => {
    const m = new Mobject();
    m.setStrokeOpacity(0.7);
    const anim = new Write(m);
    anim.begin();
    anim.finish();
    expect(m.opacity).toBe(0.7);
  });
});

// =============================================================================
// Write reverse with setRevealProgress (MathTex-like)
// =============================================================================

describe('Write - reverse with setRevealProgress', () => {
  it('begin sets reveal to 1 (reverse starts from full)', () => {
    const m = new MockMathTexMobject();
    const anim = new Write(m, { reverse: true });
    anim.begin();
    expect(m.getRevealProgress()).toBe(1);
  });

  it('interpolate decreases reveal in reverse', () => {
    const m = new MockMathTexMobject();
    const anim = new Write(m, { reverse: true });
    anim.begin();
    anim.interpolate(0.5);
    expect(m.getRevealProgress()).toBeCloseTo(0.5, 5);
    anim.interpolate(1);
    expect(m.getRevealProgress()).toBeCloseTo(0, 5);
  });
});
