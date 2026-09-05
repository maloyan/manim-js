import { describe, it, expect } from 'vitest';
import { Arrow, DoubleArrow, Vector } from './Arrow';
import { DashedLine } from './DashedLine';
import { DashedVMobject } from './DashedVMobject';
import { ArcBetweenPoints } from './ArcBetweenPoints';
import { CubicBezier } from './CubicBezier';
import { Circle } from './Circle';
import { Dot, SmallDot, LargeDot } from './Dot';
import { Line } from './Line';
import { RegularPolygram } from './PolygonExtensions';
import { BLUE, WHITE } from '../../constants';

// ---------------------------------------------------------------------------
// Arrow
// ---------------------------------------------------------------------------
describe('Arrow', () => {
  it('constructs with default options', () => {
    const a = new Arrow();
    expect(a.getStart()).toEqual([0, 0, 0]);
    expect(a.getEnd()).toEqual([1, 0, 0]);
    expect(a.getTipLength()).toBe(0.3);
    expect(a.getTipWidth()).toBe(0.1);
  });

  it('constructs with custom start/end', () => {
    const a = new Arrow({ start: [1, 2, 0], end: [4, 6, 0] });
    expect(a.getStart()).toEqual([1, 2, 0]);
    expect(a.getEnd()).toEqual([4, 6, 0]);
  });

  it('getLength returns Euclidean distance', () => {
    const a = new Arrow({ start: [0, 0, 0], end: [3, 4, 0] });
    expect(a.getLength()).toBeCloseTo(5, 10);
  });

  it('getDirection returns normalized direction', () => {
    const a = new Arrow({ start: [0, 0, 0], end: [3, 4, 0] });
    const dir = a.getDirection();
    expect(dir[0]).toBeCloseTo(3 / 5, 10);
    expect(dir[1]).toBeCloseTo(4 / 5, 10);
    expect(dir[2]).toBeCloseTo(0, 10);
  });

  it('getDirection returns [1,0,0] for zero-length arrow', () => {
    const a = new Arrow({ start: [1, 1, 0], end: [1, 1, 0] });
    expect(a.getDirection()).toEqual([1, 0, 0]);
  });

  it('getAngle returns correct XY plane angle', () => {
    const a = new Arrow({ start: [0, 0, 0], end: [0, 1, 0] });
    expect(a.getAngle()).toBeCloseTo(Math.PI / 2, 10);
  });

  it('setStart updates start and returns this', () => {
    const a = new Arrow();
    const ret = a.setStart([5, 5, 0]);
    expect(ret).toBe(a);
    expect(a.getStart()).toEqual([5, 5, 0]);
  });

  it('setEnd updates end', () => {
    const a = new Arrow();
    a.setEnd([10, 0, 0]);
    expect(a.getEnd()).toEqual([10, 0, 0]);
    expect(a.getLength()).toBeCloseTo(10, 10);
  });

  it('setTipLength / setTipWidth update tip dimensions', () => {
    const a = new Arrow();
    a.setTipLength(0.5);
    a.setTipWidth(0.3);
    expect(a.getTipLength()).toBe(0.5);
    expect(a.getTipWidth()).toBe(0.3);
  });

  it('returns defensive copies (no aliasing)', () => {
    const a = new Arrow({ start: [1, 2, 3], end: [4, 5, 6] });
    const s = a.getStart();
    s[0] = 999;
    expect(a.getStart()[0]).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// DoubleArrow
// ---------------------------------------------------------------------------
describe('DoubleArrow', () => {
  it('constructs with default options', () => {
    const da = new DoubleArrow();
    expect(da.getStart()).toEqual([0, 0, 0]);
    expect(da.getEnd()).toEqual([1, 0, 0]);
  });

  it('getLength is correct', () => {
    const da = new DoubleArrow({ start: [0, 0, 0], end: [0, 5, 0] });
    expect(da.getLength()).toBeCloseTo(5, 10);
  });

  it('setStart / setEnd update endpoints', () => {
    const da = new DoubleArrow();
    da.setStart([-1, -1, 0]);
    da.setEnd([1, 1, 0]);
    expect(da.getStart()).toEqual([-1, -1, 0]);
    expect(da.getEnd()).toEqual([1, 1, 0]);
  });
});

// ---------------------------------------------------------------------------
// Vector
// ---------------------------------------------------------------------------
describe('Vector', () => {
  it('always starts from origin', () => {
    const v = new Vector({ direction: [3, 4, 0] });
    expect(v.getStart()).toEqual([0, 0, 0]);
    expect(v.getEnd()).toEqual([3, 4, 0]);
  });

  it('uses end if direction not provided', () => {
    const v = new Vector({ end: [2, 0, 0] });
    expect(v.getEnd()).toEqual([2, 0, 0]);
  });

  it('defaults to [1,0,0]', () => {
    const v = new Vector();
    expect(v.getEnd()).toEqual([1, 0, 0]);
  });

  it('is an Arrow', () => {
    expect(new Vector()).toBeInstanceOf(Arrow);
  });
});

// ---------------------------------------------------------------------------
// DashedLine
// ---------------------------------------------------------------------------
describe('DashedLine', () => {
  it('constructs with default options', () => {
    const dl = new DashedLine();
    expect(dl.getStart()).toEqual([0, 0, 0]);
    expect(dl.getEnd()).toEqual([1, 0, 0]);
    expect(dl.getDashLength()).toBe(0.1);
    expect(dl.getDashRatio()).toBe(0.5);
    expect(dl.color).toBe(BLUE);
  });

  it('produces dashes for a line of length 1 with default options', () => {
    const dl = new DashedLine();
    // total length=1, dashLength=0.1, dashRatio=0.5 => dash=0.05, gap=0.05,
    // cycle=0.1 => exactly 10 full cycles, no remainder, so exactly 10
    // dashes (regression: this used to be 11 due to floating-point drift in
    // the old accumulated `currentPos += cycleLen` loop producing a spurious
    // 11th near-zero-length dash at the very end).
    const dashes = dl.getDashes();
    expect(dashes.length).toBe(10);
    const last = dashes[dashes.length - 1].getLocalPoints();
    const lastLen = Math.hypot(
      last[last.length - 1][0] - last[0][0],
      last[last.length - 1][1] - last[0][1],
      last[last.length - 1][2] - last[0][2],
    );
    expect(lastLen).toBeCloseTo(0.05, 5); // a real dash, not a degenerate sliver
  });

  it('getLength returns line length', () => {
    const dl = new DashedLine({ start: [0, 0, 0], end: [3, 4, 0] });
    expect(dl.getLength()).toBeCloseTo(5, 10);
  });

  it('setStart / setEnd update endpoints', () => {
    const dl = new DashedLine();
    dl.setStart([-2, 0, 0]);
    expect(dl.getStart()).toEqual([-2, 0, 0]);
    dl.setEnd([2, 0, 0]);
    expect(dl.getEnd()).toEqual([2, 0, 0]);
    expect(dl.getLength()).toBeCloseTo(4, 10);
  });

  it('setDashLength / setDashRatio update and regenerate', () => {
    const dl = new DashedLine();
    dl.setDashLength(0.2);
    expect(dl.getDashLength()).toBe(0.2);
    dl.setDashRatio(0.8);
    expect(dl.getDashRatio()).toBe(0.8);
  });

  it('clamps dashRatio to [0, 1]', () => {
    const dl = new DashedLine({ dashRatio: 2 });
    expect(dl.getDashRatio()).toBe(1);
    const dl2 = new DashedLine({ dashRatio: -1 });
    expect(dl2.getDashRatio()).toBe(0);
  });

  it('handles degenerate (zero-length) line', () => {
    const dl = new DashedLine({ start: [1, 1, 0], end: [1, 1, 0] });
    expect(dl.getDashes().length).toBe(0);
  });

  describe('deterministic dash count (regression: floating-point extra-dash bug)', () => {
    function dashLengths(dl: DashedLine): number[] {
      return dl.getDashes().map((d) => {
        const pts = d.getLocalPoints();
        const a = pts[0];
        const b = pts[pts.length - 1];
        return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      });
    }

    it('length exactly a multiple of the cycle produces no spurious extra dash', () => {
      // The original repro: 6 / 0.3 = 20 full cycles exactly -- the old
      // accumulated-addition loop produced a spurious 21st, near-zero dash.
      const dl = new DashedLine({ start: [-3, 0, 0], end: [3, 0, 0], dashLength: 0.3 });
      expect(dl.getDashes().length).toBe(20);
      for (const len of dashLengths(dl)) {
        expect(len).toBeCloseTo(0.15, 6); // every dash is a real, full-length dash
      }
    });

    it('length exactly a multiple of a different cycle (0.1) also produces no spurious extra dash', () => {
      const dl = new DashedLine({ start: [0, 0, 0], end: [6, 0, 0], dashLength: 0.1 });
      expect(dl.getDashes().length).toBe(60);
      for (const len of dashLengths(dl)) {
        expect(len).toBeCloseTo(0.05, 6);
      }
    });

    it('length with a genuine remainder produces one real (non-degenerate) final partial dash', () => {
      const dl = new DashedLine({ start: [0, 0, 0], end: [4, 0, 0], dashLength: 0.3 });
      // 4 / 0.3 = 13 full cycles (3.9) + remainder 0.1 -- the last dash is
      // shorter than a full dash (0.15) but still a real, visible segment.
      const dashes = dl.getDashes();
      expect(dashes.length).toBe(14);
      const lens = dashLengths(dl);
      for (const len of lens.slice(0, -1)) expect(len).toBeCloseTo(0.15, 6);
      expect(lens[lens.length - 1]).toBeCloseTo(0.1, 6);
      expect(lens[lens.length - 1]).toBeGreaterThan(1e-6); // not a degenerate sliver
    });

    it('different dashLength values each produce the mathematically expected count', () => {
      const cases: Array<{ length: number; dashLength: number; expected: number }> = [
        { length: 10, dashLength: 0.5, expected: 20 }, // exact multiple
        { length: 3, dashLength: 0.2, expected: 15 }, // exact multiple
        { length: 5, dashLength: 0.3, expected: 17 }, // remainder
        { length: 4, dashLength: 0.25, expected: 16 }, // exact multiple
      ];
      for (const c of cases) {
        const dl = new DashedLine({
          start: [0, 0, 0],
          end: [c.length, 0, 0],
          dashLength: c.dashLength,
        });
        expect(dl.getDashes().length).toBe(c.expected);
      }
    });

    it('different dashRatio values do not change the dash count, only dash/gap proportions', () => {
      for (const dashRatio of [0.1, 0.3, 0.5, 0.7, 0.9]) {
        const dl = new DashedLine({ start: [0, 0, 0], end: [6, 0, 0], dashLength: 0.3, dashRatio });
        expect(dl.getDashes().length).toBe(20);
        const lens = dashLengths(dl);
        for (const len of lens) expect(len).toBeCloseTo(0.3 * dashRatio, 6);
      }
    });

    it('very small total length relative to dashLength still produces a correct, small dash count', () => {
      const dl = new DashedLine({ start: [0, 0, 0], end: [0.05, 0, 0], dashLength: 0.3 });
      // 0.05 < dashLen (0.15) -- a single truncated dash covering the whole line.
      expect(dl.getDashes().length).toBe(1);
      expect(dashLengths(dl)[0]).toBeCloseTo(0.05, 6);
    });

    it('very small dashLength relative to length still produces the correct (large) count, no infinite loop', () => {
      const dl = new DashedLine({ start: [0, 0, 0], end: [1, 0, 0], dashLength: 0.01 });
      expect(dl.getDashes().length).toBe(100);
    });

    it('dashLength effectively zero produces zero dashes instead of hanging or throwing', () => {
      const dl = new DashedLine({ start: [0, 0, 0], end: [3, 0, 0], dashLength: 0 });
      expect(dl.getDashes().length).toBe(0);
      expect(dl.getLocalPoints()).toEqual([]);
    });

    it('zero-length line (start === end) still produces zero dashes with a non-zero dashLength', () => {
      const dl = new DashedLine({ start: [2, 2, 0], end: [2, 2, 0], dashLength: 0.3 });
      expect(dl.getDashes().length).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// DashedVMobject
// ---------------------------------------------------------------------------
describe('DashedVMobject', () => {
  it('constructs with a circle source', () => {
    const circle = new Circle({ radius: 1 });
    const dashed = new DashedVMobject({ vmobject: circle });
    expect(dashed.getNumDashes()).toBe(15);
    expect(dashed.getDashRatio()).toBe(0.5);
    expect(dashed.getSourceVMobject()).toBe(circle);
  });

  it('creates dashes from a circle', () => {
    const circle = new Circle({ radius: 1 });
    const dashed = new DashedVMobject({ vmobject: circle });
    const dashes = dashed.getDashes();
    // Should have up to numDashes dashes
    expect(dashes.length).toBeGreaterThan(0);
    expect(dashes.length).toBeLessThanOrEqual(15);
  });

  it('setNumDashes updates and regenerates', () => {
    const circle = new Circle({ radius: 1 });
    const dashed = new DashedVMobject({ vmobject: circle });
    dashed.setNumDashes(5);
    expect(dashed.getNumDashes()).toBe(5);
  });

  it('setDashRatio clamps to [0, 1]', () => {
    const circle = new Circle({ radius: 1 });
    const dashed = new DashedVMobject({ vmobject: circle });
    dashed.setDashRatio(2);
    expect(dashed.getDashRatio()).toBe(1);
    dashed.setDashRatio(-0.5);
    expect(dashed.getDashRatio()).toBe(0);
  });

  it('numDashes floors to at least 1', () => {
    const circle = new Circle({ radius: 1 });
    const dashed = new DashedVMobject({ vmobject: circle, numDashes: 0.5 });
    expect(dashed.getNumDashes()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// ArcBetweenPoints
// ---------------------------------------------------------------------------
describe('ArcBetweenPoints', () => {
  it('constructs with start, end, and default angle', () => {
    const abp = new ArcBetweenPoints({
      start: [-1, 0, 0],
      end: [1, 0, 0],
    });
    expect(abp.getStartPoint()).toEqual([-1, 0, 0]);
    expect(abp.getEndPoint()).toEqual([1, 0, 0]);
  });

  it('semicircle endpoints are correct', () => {
    const abp = new ArcBetweenPoints({
      start: [0, 0, 0],
      end: [2, 0, 0],
      angle: Math.PI,
    });
    const s = abp.getStartPoint();
    const e = abp.getEndPoint();
    expect(s[0]).toBeCloseTo(0, 5);
    expect(s[1]).toBeCloseTo(0, 5);
    expect(e[0]).toBeCloseTo(2, 5);
    expect(e[1]).toBeCloseTo(0, 5);
  });

  it('defaults to PI/2 angle', () => {
    const abp = new ArcBetweenPoints({
      start: [-1, 0, 0],
      end: [1, 0, 0],
    });
    // The arc angle is PI/2 by default
    expect(abp.getAngle()).toBeCloseTo(Math.PI / 2, 10);
  });

  it('has correct color defaults', () => {
    const abp = new ArcBetweenPoints({
      start: [0, 0, 0],
      end: [1, 0, 0],
    });
    expect(abp.color).toBe(BLUE);
  });
});

// ---------------------------------------------------------------------------
// CubicBezier
// ---------------------------------------------------------------------------
describe('CubicBezier', () => {
  const pts: [
    [number, number, number],
    [number, number, number],
    [number, number, number],
    [number, number, number],
  ] = [
    [0, 0, 0],
    [1, 1, 0],
    [2, -1, 0],
    [3, 0, 0],
  ];

  it('constructs and stores control points', () => {
    const cb = new CubicBezier({ points: pts });
    const cp = cb.getControlPoints();
    expect(cp[0]).toEqual([0, 0, 0]);
    expect(cp[3]).toEqual([3, 0, 0]);
  });

  it('getStart / getEnd return first and last control points', () => {
    const cb = new CubicBezier({ points: pts });
    expect(cb.getStart()).toEqual([0, 0, 0]);
    expect(cb.getEnd()).toEqual([3, 0, 0]);
  });

  it('pointAtT(0) returns start, pointAtT(1) returns end', () => {
    const cb = new CubicBezier({ points: pts });
    const start = cb.pointAtT(0);
    const end = cb.pointAtT(1);
    expect(start[0]).toBeCloseTo(0, 10);
    expect(start[1]).toBeCloseTo(0, 10);
    expect(end[0]).toBeCloseTo(3, 10);
    expect(end[1]).toBeCloseTo(0, 10);
  });

  it('pointAtT(0.5) is the midpoint of the Bezier', () => {
    // For a straight line Bezier: [0,0,0],[1,0,0],[2,0,0],[3,0,0]
    const straight = new CubicBezier({
      points: [
        [0, 0, 0],
        [1, 0, 0],
        [2, 0, 0],
        [3, 0, 0],
      ],
    });
    const mid = straight.pointAtT(0.5);
    expect(mid[0]).toBeCloseTo(1.5, 10);
    expect(mid[1]).toBeCloseTo(0, 10);
  });

  it('tangentAtT returns tangent vector', () => {
    // Straight line: tangent should be constant [3, 0, 0] direction
    const straight = new CubicBezier({
      points: [
        [0, 0, 0],
        [1, 0, 0],
        [2, 0, 0],
        [3, 0, 0],
      ],
    });
    const t = straight.tangentAtT(0);
    expect(t[0]).toBeCloseTo(3, 10);
    expect(t[1]).toBeCloseTo(0, 10);
  });

  it('normalizedTangentAtT returns unit vector', () => {
    const cb = new CubicBezier({ points: pts });
    const nt = cb.normalizedTangentAtT(0.5);
    const len = Math.sqrt(nt[0] ** 2 + nt[1] ** 2 + nt[2] ** 2);
    expect(len).toBeCloseTo(1, 10);
  });

  it('normalAtT is perpendicular to tangent', () => {
    const cb = new CubicBezier({ points: pts });
    const tangent = cb.normalizedTangentAtT(0.5);
    const normal = cb.normalAtT(0.5);
    const dot = tangent[0] * normal[0] + tangent[1] * normal[1];
    expect(dot).toBeCloseTo(0, 10);
  });

  it('curvatureAtT returns zero for a straight line', () => {
    const straight = new CubicBezier({
      points: [
        [0, 0, 0],
        [1, 0, 0],
        [2, 0, 0],
        [3, 0, 0],
      ],
    });
    expect(straight.curvatureAtT(0.5)).toBeCloseTo(0, 10);
  });

  // Regression for issue #340: the old 2D-only formula
  // `|d1[0]*d2[1] - d1[1]*d2[0]| / |d1|^3` ignored the X/Y components of
  // the 3D cross product, so the same curve rotated out of XY returned the
  // wrong curvature. With the 3D cross both should agree.
  it('curvatureAtT is invariant under rotation into the XZ plane', () => {
    const xy = new CubicBezier({
      points: [
        [0, 0, 0],
        [1, 1, 0],
        [2, 1, 0],
        [3, 0, 0],
      ],
    });
    const xz = new CubicBezier({
      points: [
        [0, 0, 0],
        [1, 0, 1],
        [2, 0, 1],
        [3, 0, 0],
      ],
    });
    for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      expect(xz.curvatureAtT(t)).toBeCloseTo(xy.curvatureAtT(t), 10);
    }
    // And both should be nonzero (the curve is genuinely curved).
    expect(xz.curvatureAtT(0.5)).toBeGreaterThan(0);
  });

  it('getApproximateLength for straight line equals 3', () => {
    const straight = new CubicBezier({
      points: [
        [0, 0, 0],
        [1, 0, 0],
        [2, 0, 0],
        [3, 0, 0],
      ],
    });
    expect(straight.getApproximateLength()).toBeCloseTo(3, 5);
  });

  it('splitAtT produces two curves that meet at the split point', () => {
    const cb = new CubicBezier({ points: pts });
    const [left, right] = cb.splitAtT(0.5);
    const leftEnd = left.getEnd();
    const rightStart = right.getStart();
    expect(leftEnd[0]).toBeCloseTo(rightStart[0], 10);
    expect(leftEnd[1]).toBeCloseTo(rightStart[1], 10);
    expect(leftEnd[2]).toBeCloseTo(rightStart[2], 10);
  });

  it('splitAtT(0.5) split point equals pointAtT(0.5)', () => {
    const cb = new CubicBezier({ points: pts });
    const splitPoint = cb.pointAtT(0.5);
    const [left] = cb.splitAtT(0.5);
    const leftEnd = left.getEnd();
    expect(leftEnd[0]).toBeCloseTo(splitPoint[0], 10);
    expect(leftEnd[1]).toBeCloseTo(splitPoint[1], 10);
  });

  it('setControlPoints updates points', () => {
    const cb = new CubicBezier({ points: pts });
    const newPts: [
      [number, number, number],
      [number, number, number],
      [number, number, number],
      [number, number, number],
    ] = [
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
      [1, 0, 0],
    ];
    cb.setControlPoints(newPts);
    expect(cb.getControlPoints()[1]).toEqual([0, 1, 0]);
  });

  it('setControlPoint updates single point', () => {
    const cb = new CubicBezier({ points: pts });
    cb.setControlPoint(2, [5, 5, 0]);
    expect(cb.getControlPoint(2)).toEqual([5, 5, 0]);
  });

  it('defaults to BLUE color', () => {
    const cb = new CubicBezier({ points: pts });
    expect(cb.color).toBe(BLUE);
  });

  it('returns defensive copies of control points', () => {
    const cb = new CubicBezier({ points: pts });
    const cp = cb.getControlPoints();
    cp[0][0] = 999;
    expect(cb.getControlPoints()[0][0]).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Dot - coverage for getPoint, setPoint, _copy
// ---------------------------------------------------------------------------
describe('Dot', () => {
  it('constructs with default options', () => {
    const d = new Dot();
    expect(d.getPoint()).toEqual([0, 0, 0]);
    expect(d.getRadius()).toBe(0.08);
    expect(d.color).toBe(WHITE);
    expect(d.fillOpacity).toBe(1);
    expect(d.strokeWidth).toBe(0);
  });

  it('constructs with custom point and color', () => {
    const d = new Dot({ point: [3, 4, 0], color: '#ff0000', radius: 0.2 });
    expect(d.getPoint()).toEqual([3, 4, 0]);
    expect(d.color).toBe('#ff0000');
    expect(d.getRadius()).toBe(0.2);
  });

  it('getPoint returns a defensive copy', () => {
    const d = new Dot({ point: [1, 2, 3] });
    const p = d.getPoint();
    p[0] = 999;
    expect(d.getPoint()[0]).toBe(1);
  });

  it('setPoint updates position (alias for moveTo)', () => {
    const d = new Dot();
    const ret = d.setPoint([5, 6, 7]);
    expect(ret).toBe(d);
    expect(d.getPoint()).toEqual([5, 6, 7]);
  });

  it('moveTo updates position', () => {
    const d = new Dot({ point: [0, 0, 0] });
    d.moveTo([10, 20, 30]);
    expect(d.getPoint()).toEqual([10, 20, 30]);
  });

  it('shift updates the point position', () => {
    const d = new Dot({ point: [1, 1, 1] });
    d.shift([2, 3, 4]);
    expect(d.getPoint()).toEqual([3, 4, 5]);
  });

  it('copy creates an independent clone with same properties', () => {
    const d = new Dot({ point: [1, 2, 0], color: '#00ff00', radius: 0.15, fillOpacity: 0.8 });
    const c = d.copy() as Dot;
    expect(c).toBeInstanceOf(Dot);
    expect(c.getPoint()).toEqual([1, 2, 0]);
    expect(c.color).toBe('#00ff00');
    expect(c.getRadius()).toBe(0.15);
    expect(c.fillOpacity).toBe(0.8);
    // Mutating the copy does not affect original
    c.setPoint([99, 99, 99]);
    expect(d.getPoint()).toEqual([1, 2, 0]);
  });

  it('handles nested array point (Python-style)', () => {
    // This tests the Array.isArray(rawPoint[0]) branch
    const d = new Dot({
      point: [[5, 6, 7] as unknown as number] as unknown as [number, number, number],
    });
    expect(d.getPoint()).toEqual([5, 6, 7]);
  });

  it('copy preserves the visible radius after scaling', () => {
    // MIGRATION: example-based regression. Intent: copying a scaled Dot yields a
    // visually identical Dot — the scale must not be applied twice (seeding the
    // clone with getRadius() while base copy() also copies scaleVector). Replace
    // with a property test (copy preserves getRadius under arbitrary scale) later.
    const d = new Dot({ radius: 0.1 });
    d.scale(3);
    const c = d.copy() as Dot;
    expect(c.getRadius()).toBeCloseTo(d.getRadius(), 10);
  });
});

// ---------------------------------------------------------------------------
// SmallDot - coverage for construction and _copy
// ---------------------------------------------------------------------------
describe('SmallDot', () => {
  it('constructs with radius 0.04', () => {
    const sd = new SmallDot();
    expect(sd.getRadius()).toBe(0.04);
    expect(sd).toBeInstanceOf(Dot);
  });

  it('constructs with custom point and color', () => {
    const sd = new SmallDot({ point: [1, 0, 0], color: '#0000ff' });
    expect(sd.getPoint()).toEqual([1, 0, 0]);
    expect(sd.color).toBe('#0000ff');
    expect(sd.getRadius()).toBe(0.04);
  });

  it('copy creates a SmallDot with same properties', () => {
    const sd = new SmallDot({ point: [2, 3, 0], color: '#ff00ff', fillOpacity: 0.5 });
    const c = sd.copy() as SmallDot;
    expect(c).toBeInstanceOf(SmallDot);
    expect(c.getPoint()).toEqual([2, 3, 0]);
    expect(c.color).toBe('#ff00ff');
    expect(c.fillOpacity).toBe(0.5);
    expect(c.getRadius()).toBe(0.04);
  });
});

// ---------------------------------------------------------------------------
// LargeDot - coverage for construction and _copy
// ---------------------------------------------------------------------------
describe('LargeDot', () => {
  it('constructs with radius 0.16', () => {
    const ld = new LargeDot();
    expect(ld.getRadius()).toBe(0.16);
    expect(ld).toBeInstanceOf(Dot);
  });

  it('constructs with custom point and color', () => {
    const ld = new LargeDot({ point: [0, 1, 0], color: '#00ffff' });
    expect(ld.getPoint()).toEqual([0, 1, 0]);
    expect(ld.color).toBe('#00ffff');
    expect(ld.getRadius()).toBe(0.16);
  });

  it('copy creates a LargeDot with same properties', () => {
    const ld = new LargeDot({
      point: [4, 5, 0],
      color: '#ffff00',
      fillOpacity: 0.9,
      strokeWidth: 2,
    });
    const c = ld.copy() as LargeDot;
    expect(c).toBeInstanceOf(LargeDot);
    expect(c.getPoint()).toEqual([4, 5, 0]);
    expect(c.color).toBe('#ffff00');
    expect(c.fillOpacity).toBe(0.9);
    expect(c.strokeWidth).toBe(2);
    expect(c.getRadius()).toBe(0.16);
  });
});

// ---------------------------------------------------------------------------
// Line - coverage for constructor, getters, setters, and _copy
// ---------------------------------------------------------------------------
describe('Line', () => {
  it('constructs with default options', () => {
    const l = new Line();
    expect(l.getStart()).toEqual([0, 0, 0]);
    expect(l.getEnd()).toEqual([1, 0, 0]);
    expect(l.color).toBe(WHITE);
    expect(l.strokeWidth).toBe(3);
    expect(l.fillOpacity).toBe(0);
  });

  it('constructs with custom start and end', () => {
    const l = new Line({ start: [-1, -1, 0], end: [2, 3, 0] });
    expect(l.getStart()).toEqual([-1, -1, 0]);
    expect(l.getEnd()).toEqual([2, 3, 0]);
  });

  it('constructs with custom color and strokeWidth', () => {
    const l = new Line({ color: '#ff0000', strokeWidth: 8 });
    expect(l.color).toBe('#ff0000');
    expect(l.strokeWidth).toBe(8);
  });

  it('getLength returns Euclidean distance', () => {
    const l = new Line({ start: [0, 0, 0], end: [3, 4, 0] });
    expect(l.getLength()).toBeCloseTo(5, 10);
  });

  it('getLength returns 0 for zero-length line', () => {
    const l = new Line({ start: [1, 1, 0], end: [1, 1, 0] });
    expect(l.getLength()).toBeCloseTo(0, 10);
  });

  it('getLength works with 3D diagonal', () => {
    const l = new Line({ start: [0, 0, 0], end: [1, 1, 1] });
    expect(l.getLength()).toBeCloseTo(Math.sqrt(3), 10);
  });

  it('getMidpoint returns the center of the line', () => {
    const l = new Line({ start: [0, 0, 0], end: [4, 6, 2] });
    expect(l.getMidpoint()).toEqual([2, 3, 1]);
  });

  it('getMidpoint returns start/end for zero-length line', () => {
    const l = new Line({ start: [5, 5, 5], end: [5, 5, 5] });
    expect(l.getMidpoint()).toEqual([5, 5, 5]);
  });

  it('getDirection returns normalized direction', () => {
    const l = new Line({ start: [0, 0, 0], end: [3, 4, 0] });
    const dir = l.getDirection();
    expect(dir[0]).toBeCloseTo(0.6, 10);
    expect(dir[1]).toBeCloseTo(0.8, 10);
    expect(dir[2]).toBeCloseTo(0, 10);
  });

  it('getDirection returns [1,0,0] for zero-length line', () => {
    const l = new Line({ start: [1, 1, 0], end: [1, 1, 0] });
    expect(l.getDirection()).toEqual([1, 0, 0]);
  });

  it('getAngle returns correct XY plane angle', () => {
    // Horizontal right
    const l1 = new Line({ start: [0, 0, 0], end: [1, 0, 0] });
    expect(l1.getAngle()).toBeCloseTo(0, 10);

    // Vertical up
    const l2 = new Line({ start: [0, 0, 0], end: [0, 1, 0] });
    expect(l2.getAngle()).toBeCloseTo(Math.PI / 2, 10);

    // 45 degrees
    const l3 = new Line({ start: [0, 0, 0], end: [1, 1, 0] });
    expect(l3.getAngle()).toBeCloseTo(Math.PI / 4, 10);

    // Horizontal left
    const l4 = new Line({ start: [0, 0, 0], end: [-1, 0, 0] });
    expect(l4.getAngle()).toBeCloseTo(Math.PI, 10);
  });

  it('setStart updates start and regenerates points', () => {
    const l = new Line();
    const ret = l.setStart([5, 5, 0]);
    expect(ret).toBe(l);
    expect(l.getStart()).toEqual([5, 5, 0]);
  });

  it('setEnd updates end and regenerates points', () => {
    const l = new Line();
    const ret = l.setEnd([10, 0, 0]);
    expect(ret).toBe(l);
    expect(l.getEnd()).toEqual([10, 0, 0]);
    expect(l.getLength()).toBeCloseTo(10, 10);
  });

  it('pointAlongPath returns correct interpolated points', () => {
    const l = new Line({ start: [0, 0, 0], end: [10, 0, 0] });
    const p0 = l.pointAlongPath(0);
    expect(p0).toEqual([0, 0, 0]);
    const p1 = l.pointAlongPath(1);
    expect(p1).toEqual([10, 0, 0]);
    const pHalf = l.pointAlongPath(0.5);
    expect(pHalf).toEqual([5, 0, 0]);
    const pQuarter = l.pointAlongPath(0.25);
    expect(pQuarter).toEqual([2.5, 0, 0]);
  });

  it('pointAlongPath works with diagonal line', () => {
    const l = new Line({ start: [0, 0, 0], end: [4, 6, 2] });
    const mid = l.pointAlongPath(0.5);
    expect(mid[0]).toBeCloseTo(2, 10);
    expect(mid[1]).toBeCloseTo(3, 10);
    expect(mid[2]).toBeCloseTo(1, 10);
  });

  it('copy creates an independent clone', () => {
    const l = new Line({ start: [1, 2, 0], end: [3, 4, 0], color: '#abcdef', strokeWidth: 5 });
    const c = l.copy() as Line;
    expect(c).toBeInstanceOf(Line);
    expect(c.getStart()).toEqual([1, 2, 0]);
    expect(c.getEnd()).toEqual([3, 4, 0]);
    expect(c.color).toBe('#abcdef');
    expect(c.strokeWidth).toBe(5);
    // Mutating the copy does not affect original
    c.setStart([99, 99, 0]);
    expect(l.getStart()).toEqual([1, 2, 0]);
  });

  it('getStart/getEnd return from _points3D when available', () => {
    // After construction, _points3D should have 4 points
    const l = new Line({ start: [1, 2, 0], end: [3, 4, 0] });
    // getStart should read from _points3D[0]
    const s = l.getStart();
    expect(s[0]).toBeCloseTo(1, 5);
    expect(s[1]).toBeCloseTo(2, 5);
    // getEnd should read from _points3D[last]
    const e = l.getEnd();
    expect(e[0]).toBeCloseTo(3, 5);
    expect(e[1]).toBeCloseTo(4, 5);
  });

  it('getStart/getEnd fall back to stored values when points are cleared', () => {
    const l = new Line({ start: [1, 2, 0], end: [3, 4, 0] });
    // Clear internal points to trigger fallback branch
    l.clearPoints();
    expect(l.getStart()).toEqual([1, 2, 0]);
    expect(l.getEnd()).toEqual([3, 4, 0]);
  });

  it('derived getters stay consistent with world-space getStart/getEnd under a transform', () => {
    // MIGRATION: example-based regression. Intent: length/midpoint/direction/angle/
    // pointAlongPath all derive from the world-space endpoints, so they must agree
    // with getStart()/getEnd() after the line is rotated/scaled/shifted (not read
    // raw local points). Replace with a property test over random transforms later.
    const l = new Line({ start: [-1, 0, 0], end: [1, 2, 0] });
    l.rotate(Math.PI / 6);
    l.scale(2);
    l.shift([3, -1, 0]);

    const s = l.getStart();
    const e = l.getEnd();
    const dist = Math.hypot(e[0] - s[0], e[1] - s[1], e[2] - s[2]);

    expect(l.getLength()).toBeCloseTo(dist, 6);

    const mid = l.getMidpoint();
    expect(mid[0]).toBeCloseTo((s[0] + e[0]) / 2, 6);
    expect(mid[1]).toBeCloseTo((s[1] + e[1]) / 2, 6);
    expect(mid[2]).toBeCloseTo((s[2] + e[2]) / 2, 6);

    expect(l.getAngle()).toBeCloseTo(Math.atan2(e[1] - s[1], e[0] - s[0]), 6);

    const dir = l.getDirection();
    expect(dir[0]).toBeCloseTo((e[0] - s[0]) / dist, 6);
    expect(dir[1]).toBeCloseTo((e[1] - s[1]) / dist, 6);

    const p0 = l.pointAlongPath(0);
    const p1 = l.pointAlongPath(1);
    expect(p0[0]).toBeCloseTo(s[0], 6);
    expect(p0[1]).toBeCloseTo(s[1], 6);
    expect(p1[0]).toBeCloseTo(e[0], 6);
    expect(p1[1]).toBeCloseTo(e[1], 6);
  });
});

// ---------------------------------------------------------------------------
// DashedLine - coverage for setColor, setStrokeWidth, setStrokeOpacity, _copy
// ---------------------------------------------------------------------------
describe('DashedLine - propagation and copy', () => {
  it('setColor propagates to all dash children', () => {
    const dl = new DashedLine({ start: [0, 0, 0], end: [2, 0, 0] });
    const dashes = dl.getDashes();
    expect(dashes.length).toBeGreaterThan(0);

    dl.setColor('#ff0000');
    expect(dl.color).toBe('#ff0000');
    for (const dash of dl.getDashes()) {
      expect(dash.color).toBe('#ff0000');
    }
  });

  it('setStrokeWidth propagates to all dash children', () => {
    const dl = new DashedLine({ start: [0, 0, 0], end: [2, 0, 0] });
    dl.setStrokeWidth(10);
    expect(dl.strokeWidth).toBe(10);
    for (const dash of dl.getDashes()) {
      expect(dash.strokeWidth).toBe(10);
    }
  });

  it('setStrokeOpacity propagates to all dash children', () => {
    const dl = new DashedLine({ start: [0, 0, 0], end: [2, 0, 0] });
    dl.setStrokeOpacity(0.3);
    expect(dl.opacity).toBeCloseTo(0.3, 10);
    for (const dash of dl.getDashes()) {
      expect(dash.opacity).toBeCloseTo(0.3, 10);
    }
  });

  it('setColor returns this for chaining', () => {
    const dl = new DashedLine();
    const ret = dl.setColor('#00ff00');
    expect(ret).toBe(dl);
  });

  it('setStrokeWidth returns this for chaining', () => {
    const dl = new DashedLine();
    const ret = dl.setStrokeWidth(5);
    expect(ret).toBe(dl);
  });

  it('setStrokeOpacity returns this for chaining', () => {
    const dl = new DashedLine();
    const ret = dl.setStrokeOpacity(0.5);
    expect(ret).toBe(dl);
  });

  it('copy creates an independent clone with same properties', () => {
    const dl = new DashedLine({
      start: [1, 0, 0],
      end: [5, 0, 0],
      dashLength: 0.2,
      dashRatio: 0.7,
      color: '#123456',
      strokeWidth: 6,
    });
    const c = dl.copy() as DashedLine;
    expect(c).toBeInstanceOf(DashedLine);
    expect(c.getStart()).toEqual([1, 0, 0]);
    expect(c.getEnd()).toEqual([5, 0, 0]);
    expect(c.getDashLength()).toBe(0.2);
    expect(c.getDashRatio()).toBe(0.7);
    expect(c.color).toBe('#123456');
    expect(c.strokeWidth).toBe(6);
    // The constructor already rebuilds dashes from the copied endpoint
    // params -- _copyBaseAttributesInto must not ALSO copy the original's
    // children on top, or the clone ends up with double the dashes.
    expect(c.children.length).toBe(dl.children.length);
    expect(c.getDashes().length).toBe(dl.getDashes().length);
    // Mutating the copy does not affect original
    c.setStart([99, 0, 0]);
    expect(dl.getStart()).toEqual([1, 0, 0]);
  });

  it('copy produces dashes in the clone', () => {
    const dl = new DashedLine({ start: [0, 0, 0], end: [3, 0, 0] });
    const c = dl.copy() as DashedLine;
    expect(c.getDashes().length).toBeGreaterThan(0);
  });

  describe('copy() does not duplicate children (regression)', () => {
    it('children count matches exactly, before and after, for several dashLength/dashRatio combinations', () => {
      const cases = [
        { start: [-3, 0, 0] as const, end: [3, 0, 0] as const, dashLength: 0.3, dashRatio: 0.5 },
        { start: [-2, 1, 0] as const, end: [2, -1, 0] as const, dashLength: 0.12, dashRatio: 0.3 },
        { start: [0, 0, 0] as const, end: [1, 0, 0] as const, dashLength: 0.25, dashRatio: 0.9 },
      ];
      for (const c of cases) {
        const dl = new DashedLine(c);
        const before = dl.children.length;
        expect(before).toBeGreaterThan(0);

        const clone = dl.copy() as DashedLine;

        // The exact bug this guards: _copyBaseAttributesInto's default
        // copyChildren=true would re-add the original's (copied) children on
        // top of the ones the DashedLine constructor already rebuilt from
        // start/end/dashLength/dashRatio, doubling the count.
        expect(clone.children.length).toBe(before);
        expect(clone.getDashes().length).toBe(dl.getDashes().length);
        expect((clone as unknown as { _dashes: unknown[] })._dashes.length).toBe(
          clone.children.length,
        );
      }
    });

    it('clone geometry is point-for-point identical to the original, dash by dash', () => {
      const dl = new DashedLine({
        start: [-2, 1, 0],
        end: [3, -1, 0],
        dashLength: 0.2,
        dashRatio: 0.6,
      });
      const clone = dl.copy() as DashedLine;

      const originalDashes = dl.getDashes();
      const clonedDashes = clone.getDashes();
      expect(clonedDashes.length).toBe(originalDashes.length);
      for (let i = 0; i < originalDashes.length; i++) {
        expect(clonedDashes[i].getLocalPoints()).toEqual(originalDashes[i].getLocalPoints());
      }
    });

    it('preserves start/end/dashLength/dashRatio/color/strokeWidth exactly', () => {
      const dl = new DashedLine({
        start: [1, 2, 0],
        end: [-4, 5, 0],
        dashLength: 0.17,
        dashRatio: 0.42,
        color: '#abcdef',
        strokeWidth: 9,
      });
      const clone = dl.copy() as DashedLine;

      expect(clone.getStart()).toEqual(dl.getStart());
      expect(clone.getEnd()).toEqual(dl.getEnd());
      expect(clone.getDashLength()).toBe(dl.getDashLength());
      expect(clone.getDashRatio()).toBe(dl.getDashRatio());
      expect(clone.color).toBe(dl.color);
      expect(clone.strokeWidth).toBe(dl.strokeWidth);

      // Mutating a copied parameter regenerates the clone's own dashes
      // correctly, independent of the original (constructor-rebuild path
      // still works after the copyChildren:false change).
      clone.setDashLength(0.5);
      expect(clone.getDashLength()).toBe(0.5);
      expect(dl.getDashLength()).toBe(0.17);
      expect(clone.getDashes().length).toBeGreaterThan(0);
    });

    it('does not regress RegularPolygram, the sibling self-rebuilding composite that already used copyChildren:false', () => {
      const poly = new RegularPolygram({ numVertices: 6, density: 2, radius: 1.5 });
      const before = poly.children.length;
      expect(before).toBe(2); // gcd(6,2)=2 components

      const clone = poly.copy();
      expect(clone.children.length).toBe(before);
    });
  });
});
