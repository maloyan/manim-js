import { describe, expect, it } from 'vitest';
import { VMobject } from '../../core/VMobject';
import { VGroup } from '../../core/VGroup';
import { Circle } from '../../mobjects/geometry/Circle';
import { DashedLine } from '../../mobjects/geometry/DashedLine';
import { alignVmobjectPair, needsLeafPairing, pairLeafSnapshotsByIndex } from './TransformPairing';
import { alignCompoundPathsForTransform } from '../../core/VMobjectTransformAlignment';

function vmWithPoints(pts: number[][]) {
  const vm = new VMobject();
  vm.setPoints(pts);
  return vm;
}

function makeLinearClosedSquare(x0: number, y0: number, x1: number, y1: number): number[][] {
  const corners = [
    [x0, y0, 0],
    [x1, y0, 0],
    [x1, y1, 0],
    [x0, y1, 0],
    [x0, y0, 0],
  ];

  const pts: number[][] = [];
  for (let i = 0; i < corners.length - 1; i++) {
    const a = corners[i];
    const b = corners[i + 1];
    if (i === 0) pts.push([...a]);
    pts.push([a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3, a[2] + (b[2] - a[2]) / 3]);
    pts.push([
      a[0] + (2 * (b[0] - a[0])) / 3,
      a[1] + (2 * (b[1] - a[1])) / 3,
      a[2] + (2 * (b[2] - a[2])) / 3,
    ]);
    pts.push([...b]);
  }
  return pts;
}

describe('TransformPairing core', () => {
  it('throws when provided subpath lengths do not match point count', () => {
    const source = vmWithPoints([
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
      [0, 1, 0],
      [0, 0, 0],
    ]);
    const target = vmWithPoints([
      [0, 0, 0],
      [2, 0, 0],
      [2, 2, 0],
      [0, 2, 0],
      [0, 0, 0],
    ]);

    source.setBaseSubpathLengths([4]);

    expect(() => alignVmobjectPair(source, target)).toThrow(
      /subpath lengths sum .* does not match point count/i,
    );
  });
  it('alignVmobjectPair keeps exact final target topology while returning aligned interpolation points', () => {
    const source = vmWithPoints([
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
      [0, 1, 0],
      [0, 0, 0],
    ]);
    const target = vmWithPoints([
      [0, 0, 0],
      [2, 0, 0],
      [2, 2, 0],
      [0, 2, 0],
      [0, 0, 0],
      [0.8, 0.8, 0],
      [1.2, 0.8, 0],
      [1.2, 1.2, 0],
      [0.8, 1.2, 0],
      [0.8, 0.8, 0],
    ]);

    source.setBaseSubpathLengths([5]);
    target.setBaseSubpathLengths([5, 5]);

    const aligned = alignVmobjectPair(source, target);

    expect(aligned.alignedSubpathLengths).toEqual([5, 5]);
    expect(aligned.startPoints.length).toBe(10);
    expect(aligned.targetPoints.length).toBe(10);

    expect(aligned.finalTargetPoints).toEqual(target.getLocalPoints());
    expect(aligned.finalTargetSubpathLengths).toEqual([5, 5]);
  });

  it('alignVmobjectPair falls back to alignPoints for simple paths', () => {
    const source = new Circle({ radius: 1 });
    const target = new Circle({ radius: 2 });

    const aligned = alignVmobjectPair(source, target);

    expect(aligned.startPoints.length).toBe(aligned.targetPoints.length);
    expect(aligned.alignedSubpathLengths).toBeUndefined();
    expect(aligned.finalTargetPoints).toEqual(target.getLocalPoints());
  });

  it('uses length-sorted pairing within orientation buckets', () => {
    const source = vmWithPoints([
      // short (len=5)
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
      [0, 1, 0],
      [0, 0, 0],
      // long (len=8)
      [100, 0, 0],
      [101, 0, 0],
      [102, 0, 0],
      [103, 0, 0],
      [104, 0, 0],
      [105, 0, 0],
      [106, 0, 0],
      [107, 0, 0],
    ]);

    const target = vmWithPoints([
      // short (len=5)
      [1000, 0, 0],
      [1001, 0, 0],
      [1001, 1, 0],
      [1000, 1, 0],
      [1000, 0, 0],
      // long (len=8)
      [2000, 0, 0],
      [2001, 0, 0],
      [2002, 0, 0],
      [2003, 0, 0],
      [2004, 0, 0],
      [2005, 0, 0],
      [2006, 0, 0],
      [2007, 0, 0],
    ]);

    source.setBaseSubpathLengths([5, 8]);
    target.setBaseSubpathLengths([5, 8]);

    const aligned = alignVmobjectPair(source, target);

    // Sorting by descending subpath length should emit long pair first.
    expect(aligned.alignedSubpathLengths).toEqual([8, 5]);
    expect(aligned.startPoints[0][0]).toBeCloseTo(100, 5);
    expect(aligned.targetPoints[0][0]).toBeCloseTo(2000, 5);
  });

  it('prefers same-orientation pairing even if lengths would suggest cross-pairing', () => {
    const srcPoints = [
      // src CW (len=8)
      [100, 0, 0],
      [101, 0, 0],
      [102, 0, 0],
      [103, 0, 0],
      [104, 0, 0],
      [105, 0, 0],
      [106, 0, 0],
      [107, 0, 0],
      // src CCW (len=5)
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
      [0, 1, 0],
      [0, 0, 0],
    ];

    const tgtPoints = [
      // tgt CW (len=5)
      [2000, 0, 0],
      [2001, 0, 0],
      [2001, 1, 0],
      [2000, 1, 0],
      [2000, 0, 0],
      // tgt CCW (len=8)
      [1000, 0, 0],
      [1001, 0, 0],
      [1002, 0, 0],
      [1003, 0, 0],
      [1004, 0, 0],
      [1005, 0, 0],
      [1006, 0, 0],
      [1007, 0, 0],
    ];

    const aligned = alignCompoundPathsForTransform(
      srcPoints,
      [8, 5],
      tgtPoints,
      [5, 8],
      [-1, 1],
      [-1, 1],
    );

    expect(aligned).not.toBeNull();
    // First pair should be CW↔CW (target near x=2000), not longest↔longest (x=1000)
    expect(aligned!.tgtAlignedPoints[0][0]).toBeCloseTo(2000, 5);
  });

  it('does not cross-pair when all subpaths are opposite orientation', () => {
    const srcA = makeLinearClosedSquare(0, 0, 1, 1);
    const srcB = makeLinearClosedSquare(2, 0, 3, 1);
    const tgtA = makeLinearClosedSquare(10, 10, 11, 11);
    const tgtB = makeLinearClosedSquare(12, 10, 13, 11);

    const src = [...srcA, ...srcB];
    const tgt = [...tgtA, ...tgtB];

    const aligned = alignCompoundPathsForTransform(
      src,
      [srcA.length, srcB.length],
      tgt,
      [tgtA.length, tgtB.length],
      [-1, -1],
      [1, 1],
    );

    expect(aligned).not.toBeNull();
    expect(aligned!.alignedSubpathLengths).toEqual([
      srcA.length,
      srcB.length,
      tgtA.length,
      tgtB.length,
    ]);

    const isConstant = (points: number[][]) =>
      points.every(
        (p) =>
          p[0] === points[0][0] && p[1] === points[0][1] && (p[2] ?? 0) === (points[0][2] ?? 0),
      );

    const L = srcA.length;
    // First two chunks: (-1) bucket => source real, target placeholders.
    const firstSrc = aligned!.srcAlignedPoints.slice(0, L);
    const firstTgt = aligned!.tgtAlignedPoints.slice(0, L);
    const secondSrc = aligned!.srcAlignedPoints.slice(L, 2 * L);
    const secondTgt = aligned!.tgtAlignedPoints.slice(L, 2 * L);

    expect(isConstant(firstSrc)).toBe(false);
    expect(isConstant(firstTgt)).toBe(true);
    expect(isConstant(secondSrc)).toBe(false);
    expect(isConstant(secondTgt)).toBe(true);

    // Last two chunks: (+1) bucket => source placeholders, target real.
    const thirdSrc = aligned!.srcAlignedPoints.slice(2 * L, 3 * L);
    const thirdTgt = aligned!.tgtAlignedPoints.slice(2 * L, 3 * L);
    const fourthSrc = aligned!.srcAlignedPoints.slice(3 * L, 4 * L);
    const fourthTgt = aligned!.tgtAlignedPoints.slice(3 * L, 4 * L);

    expect(isConstant(thirdSrc)).toBe(true);
    expect(isConstant(thirdTgt)).toBe(false);
    expect(isConstant(fourthSrc)).toBe(true);
    expect(isConstant(fourthTgt)).toBe(false);
  });

  it('rotates closed target subpath so first anchor is closest to source first anchor', () => {
    const sourceA = makeLinearClosedSquare(-1, -1, 1, 1);
    const sourceB = makeLinearClosedSquare(5, 5, 6, 6);
    const sourcePts = [...sourceA, ...sourceB];

    const targetA = makeLinearClosedSquare(-1, -1, 1, 1);
    const targetB = makeLinearClosedSquare(5, 5, 6, 6);

    // Rotate first target subpath start by one cubic segment (stride=3).
    const shift = 3;
    const openLen = targetA.length - 1;
    const rotatedOpen: number[][] = [];
    for (let i = 0; i < openLen; i++) {
      rotatedOpen.push([...targetA[(i + shift) % openLen]]);
    }
    const targetAShifted = [...rotatedOpen, [...rotatedOpen[0]]];

    const targetPts = [...targetAShifted, ...targetB];

    const aligned = alignCompoundPathsForTransform(
      sourcePts,
      [sourceA.length, sourceB.length],
      targetPts,
      [targetAShifted.length, targetB.length],
      [1, 1],
      [1, 1],
    );

    expect(aligned).not.toBeNull();
    expect(aligned!.srcAlignedPoints[0][0]).toBeCloseTo(-1, 6);
    expect(aligned!.srcAlignedPoints[0][1]).toBeCloseTo(-1, 6);
    expect(aligned!.tgtAlignedPoints[0][0]).toBeCloseTo(-1, 6);
    expect(aligned!.tgtAlignedPoints[0][1]).toBeCloseTo(-1, 6);
  });

  it('alignVmobjectPair applies closest-anchor rotation for closed compound subpaths', () => {
    const sourceA = makeLinearClosedSquare(-1, -1, 1, 1);
    const sourceB = makeLinearClosedSquare(5, 5, 6, 6);
    const source = vmWithPoints([...sourceA, ...sourceB]);
    source.setBaseSubpathLengths([sourceA.length, sourceB.length]);

    const targetA = makeLinearClosedSquare(-1, -1, 1, 1);
    const targetB = makeLinearClosedSquare(5, 5, 6, 6);

    // Start targetA at a different anchor (one cubic segment shift).
    const shift = 3;
    const openLen = targetA.length - 1;
    const rotatedOpen: number[][] = [];
    for (let i = 0; i < openLen; i++) rotatedOpen.push([...targetA[(i + shift) % openLen]]);
    const targetAShifted = [...rotatedOpen, [...rotatedOpen[0]]];

    const target = vmWithPoints([...targetAShifted, ...targetB]);
    target.setBaseSubpathLengths([targetAShifted.length, targetB.length]);

    const aligned = alignVmobjectPair(source, target);

    expect(aligned.startPoints[0][0]).toBeCloseTo(-1, 6);
    expect(aligned.startPoints[0][1]).toBeCloseTo(-1, 6);
    expect(aligned.targetPoints[0][0]).toBeCloseTo(-1, 6);
    expect(aligned.targetPoints[0][1]).toBeCloseTo(-1, 6);
  });

  it('pairLeafSnapshotsByIndex preserves left-to-right leaf order and pads the shorter side by duplication', () => {
    const a = new Circle({ radius: 1 });
    const b = new Circle({ radius: 0.8 });
    const c = new Circle({ radius: 0.6 });
    const source = new VGroup(new VGroup(a, b), c);

    const t0 = new Circle({ radius: 1.2 });
    const target = new VGroup(t0);

    const pairs = pairLeafSnapshotsByIndex(source, target);

    expect(pairs.length).toBe(3);

    expect(pairs[0].source.leaf).toBe(a);
    expect(pairs[0].target.leaf).toBe(t0);
    expect(pairs[0].sourceIsPlaceholder).toBe(false);
    expect(pairs[0].targetIsPlaceholder).toBe(false);
    expect(pairs[0].sourceIsNew).toBe(false);

    // b and c pair with real duplicates of t0 (Manim CE
    // add_n_more_submobjects), never with blank invisible placeholders.
    expect(pairs[1].source.leaf).toBe(b);
    expect(pairs[1].sourceIsPlaceholder).toBe(false);
    expect(pairs[1].targetIsPlaceholder).toBe(false);
    expect(pairs[1].target.leaf).not.toBe(t0);
    expect(pairs[1].target.leaf.getLocalPoints()).toEqual(t0.getLocalPoints());

    expect(pairs[2].source.leaf).toBe(c);
    expect(pairs[2].sourceIsPlaceholder).toBe(false);
    expect(pairs[2].targetIsPlaceholder).toBe(false);
    expect(pairs[2].target.leaf).not.toBe(t0);
    expect(pairs[2].target.leaf.getLocalPoints()).toEqual(t0.getLocalPoints());
  });

  describe('needsLeafPairing (issue #545: non-VGroup VMobjects that delegate to children)', () => {
    it('is false for a plain leaf VMobject that owns points directly', () => {
      const circle = new Circle({ radius: 1 });
      expect(needsLeafPairing(circle)).toBe(false);
    });

    it('is true for a VGroup (owns no points, delegates to children)', () => {
      const group = new VGroup(new Circle({ radius: 1 }));
      expect(needsLeafPairing(group)).toBe(true);
    });

    it('is true for a DashedLine: a plain VMobject (not VGroup) that clears its own points and renders via children', () => {
      const dashed = new DashedLine({ start: [-1, 0, 0], end: [1, 0, 0], dashLength: 0.2 });
      expect(dashed).not.toBeInstanceOf(VGroup);
      expect(dashed.hasOwnPoints()).toBe(false);
      expect(dashed.getDashes().length).toBeGreaterThan(0);
      expect(needsLeafPairing(dashed)).toBe(true);
    });

    it('is false for an empty VMobject with neither own points nor children', () => {
      expect(needsLeafPairing(new VMobject())).toBe(false);
    });
  });

  describe('pairLeafSnapshotsByIndex on a non-VGroup container (DashedLine)', () => {
    it('descends into DashedLine children instead of treating the DashedLine itself as one empty leaf', () => {
      const source = new DashedLine({ start: [-1, 0, 0], end: [1, 0, 0], dashLength: 0.2 });
      const target = new DashedLine({ start: [-1, 0, 0], end: [1, 0, 0], dashLength: 0.5 });

      const pairs = pairLeafSnapshotsByIndex(source, target);

      // Every leaf should be a real dash segment (or a real duplicate of
      // one) -- never the DashedLine container itself, which owns no points.
      expect(pairs.length).toBe(Math.max(source.getDashes().length, target.getDashes().length));
      for (const pair of pairs) {
        expect(pair.source.leaf).not.toBe(source);
        expect(pair.target.leaf).not.toBe(target);
        expect(pair.source.leaf.getLocalPoints().length).toBeGreaterThan(0);
        expect(pair.target.leaf.getLocalPoints().length).toBeGreaterThan(0);
      }
    });
  });
});
