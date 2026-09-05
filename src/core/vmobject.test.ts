import { describe, it, expect, vi } from 'vitest';
import { VMobject } from './VMobject';
import { VGroup } from './VGroup';
import { Group } from './Group';
import {
  getNumCurves,
  getNthCurve,
  curvesAsSubmobjects,
  CurvesAsSubmobjects,
} from './VMobjectCurveUtils';

describe('VMobject constructor defaults', () => {
  it('defaults fillOpacity to 0.5', () => {
    const v = new VMobject();
    expect(v.fillOpacity).toBe(0.5);
  });

  it('defaults color to white', () => {
    const v = new VMobject();
    expect(v.color.toLowerCase()).toBe('#ffffff');
  });

  it('has empty points initially', () => {
    const v = new VMobject();
    expect(v.numPoints).toBe(0);
    expect(v.getLocalPoints()).toEqual([]);
    expect(v.points).toEqual([]);
  });

  it('style fillOpacity and strokeOpacity are set in constructor', () => {
    const v = new VMobject();
    const s = v.style;
    expect(s.fillOpacity).toBe(0.5);
    expect(s.strokeOpacity).toBe(1);
  });
});

describe('VMobject.setPoints / getPoints', () => {
  it('setPoints with number[][] stores a deep copy', () => {
    const v = new VMobject();
    const pts = [
      [1, 2, 3],
      [4, 5, 6],
    ];
    v.setPoints(pts);
    expect(v.getLocalPoints()).toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    pts[0][0] = 999;
    expect(v.getLocalPoints()[0][0]).toBe(1);
  });

  it('setPoints with Point[] (2D) converts to 3D with z=0', () => {
    const v = new VMobject();
    v.setPoints([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ]);
    const pts = v.getLocalPoints();
    expect(pts).toEqual([
      [10, 20, 0],
      [30, 40, 0],
    ]);
  });

  it('setPoints with empty array clears points', () => {
    const v = new VMobject();
    v.setPoints([[1, 0, 0]]);
    v.setPoints([]);
    expect(v.numPoints).toBe(0);
  });

  it('setPoints resets visiblePointCount to null', () => {
    const v = new VMobject();
    v.setPoints([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
    ]);
    v.visiblePointCount = 2;
    v.setPoints([
      [0, 0, 0],
      [1, 0, 0],
    ]);
    expect(v.visiblePointCount).toBe(2);
  });

  it('getPoints returns a deep copy', () => {
    const v = new VMobject();
    v.setPoints([[1, 2, 3]]);
    const pts = v.getLocalPoints();
    pts[0][0] = 999;
    expect(v.getLocalPoints()[0][0]).toBe(1);
  });
});

describe('VMobject.getPoints (#392)', () => {
  it('returns local-space points when there is no parent and no self-transform', () => {
    const v = new VMobject();
    v.setPoints([
      [1, 0, 0],
      [0, 1, 0],
    ]);
    expect(v.getPoints()).toEqual([
      [1, 0, 0],
      [0, 1, 0],
    ]);
  });

  it('applies self-transform when no parent', () => {
    const v = new VMobject();
    v.setPoints([[1, 0, 0]]);
    v.position.set(10, 20, 30);
    const pts = v.getPoints();
    expect(pts[0][0]).toBeCloseTo(11);
    expect(pts[0][1]).toBeCloseTo(20);
    expect(pts[0][2]).toBeCloseTo(30);
  });

  it('applies parent Group transforms (scale + shift)', () => {
    const v = new VMobject();
    v.setPoints([[1, 0, 0]]);

    // Intent: verify parent transform propagation in getPoints().
    // Use post-construction attach to avoid Group constructor normalization,
    // which is a separate behavior from #392 world-point composition.
    const g = new Group();
    g.add(v);

    g.scale(2, { aboutPoint: [0, 0, 0] }); // scale about origin, not the group center
    g.shift([0, 5, 0]);

    const pts = v.getPoints();
    expect(pts[0][0]).toBeCloseTo(2);
    expect(pts[0][1]).toBeCloseTo(5);
    expect(pts[0][2]).toBeCloseTo(0);
  });

  it('does not mutate getPoints (which stays local)', () => {
    const v = new VMobject();
    v.setPoints([[1, 0, 0]]);

    // Same isolation as above: focus this test on local-vs-world contract.
    const g = new Group();
    g.add(v);
    g.scale(2, { aboutPoint: [0, 0, 0] }); // scale about origin, not the group center

    expect(v.getLocalPoints()).toEqual([[1, 0, 0]]); // local snapshot remains local
    expect(v.getPoints()[0][0]).toBeCloseTo(2); // world includes parent scale
    expect(v.getLocalPoints()).toEqual([[1, 0, 0]]); // getPoints() does not mutate local
  });
});

describe('VMobject.setPoints3D', () => {
  it('is an alias for setPoints with number[][]', () => {
    const v = new VMobject();
    v.setPoints3D([
      [5, 6, 7],
      [8, 9, 10],
    ]);
    expect(v.getLocalPoints()).toEqual([
      [5, 6, 7],
      [8, 9, 10],
    ]);
    expect(v.numPoints).toBe(2);
  });
});

describe('VMobject.points getter (2D)', () => {
  it('returns Point[] derived from 3D points', () => {
    const v = new VMobject();
    v.setPoints([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    const pts2d = v.points;
    expect(pts2d).toEqual([
      { x: 1, y: 2 },
      { x: 4, y: 5 },
    ]);
  });
});

describe('VMobject.addPoints', () => {
  it('appends 2D points to existing points', () => {
    const v = new VMobject();
    v.setPoints([[0, 0, 0]]);
    v.addPoints({ x: 1, y: 1 }, { x: 2, y: 2 });
    expect(v.numPoints).toBe(3);
    expect(v.getLocalPoints()[1]).toEqual([1, 1, 0]);
    expect(v.getLocalPoints()[2]).toEqual([2, 2, 0]);
  });
});

describe('VMobject.clearPoints', () => {
  it('removes all points and resets visiblePointCount', () => {
    const v = new VMobject();
    v.setPoints([
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
      [4, 0, 0],
    ]);
    v.visiblePointCount = 2;
    v.clearPoints();
    expect(v.numPoints).toBe(0);
    expect(v.visiblePointCount).toBe(0);
  });
});

describe('VMobject.visiblePointCount', () => {
  it('defaults to total point count', () => {
    const v = new VMobject();
    v.setPoints([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
    ]);
    expect(v.visiblePointCount).toBe(4);
  });

  it('can be set to limit visible points', () => {
    const v = new VMobject();
    v.setPoints([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
    ]);
    v.visiblePointCount = 2;
    expect(v.visiblePointCount).toBe(2);
  });

  it('clamps to 0 and total point count', () => {
    const v = new VMobject();
    v.setPoints([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
    ]);
    v.visiblePointCount = -5;
    expect(v.visiblePointCount).toBe(0);
    v.visiblePointCount = 100;
    expect(v.visiblePointCount).toBe(3);
  });
});

describe('VMobject.getVisiblePoints / getVisiblePoints3D', () => {
  it('returns all points when visiblePointCount is not set', () => {
    const v = new VMobject();
    v.setPoints([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
    ]);
    expect(v.getVisiblePoints()).toHaveLength(4);
    expect(v.getVisiblePoints3D()).toHaveLength(4);
  });

  it('returns limited points when visiblePointCount is set', () => {
    const v = new VMobject();
    v.setPoints([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
    ]);
    v.visiblePointCount = 2;
    expect(v.getVisiblePoints()).toHaveLength(2);
    expect(v.getVisiblePoints()[0]).toEqual({ x: 0, y: 0 });
    expect(v.getVisiblePoints()[1]).toEqual({ x: 1, y: 0 });
    expect(v.getVisiblePoints3D()).toHaveLength(2);
    expect(v.getVisiblePoints3D()[0]).toEqual([0, 0, 0]);
    expect(v.getVisiblePoints3D()[1]).toEqual([1, 0, 0]);
  });

  it('getVisiblePoints3D returns deep copies', () => {
    const v = new VMobject();
    v.setPoints([[1, 2, 3]]);
    const pts = v.getVisiblePoints3D();
    pts[0][0] = 999;
    expect(v.getVisiblePoints3D()[0][0]).toBe(1);
  });
});

describe('VMobject.setPointsAsCorners', () => {
  it('creates cubic Bezier segments from corners', () => {
    const v = new VMobject();
    v.setPointsAsCorners([
      [0, 0, 0],
      [3, 0, 0],
      [3, 3, 0],
    ]);
    const pts = v.getLocalPoints();
    expect(pts.length).toBe(7);
    expect(pts[0]).toEqual([0, 0, 0]);
    expect(pts[6]).toEqual([3, 3, 0]);
    expect(pts[3]).toEqual([3, 0, 0]);
  });

  it('handles single corner point', () => {
    const v = new VMobject();
    v.setPointsAsCorners([[5, 5, 0]]);
    expect(v.getLocalPoints()).toEqual([[5, 5, 0]]);
  });

  it('handles empty array', () => {
    const v = new VMobject();
    v.setPointsAsCorners([]);
    expect(v.getLocalPoints()).toEqual([]);
  });

  it('handles two corners with correct handles', () => {
    const v = new VMobject();
    v.setPointsAsCorners([
      [0, 0, 0],
      [6, 0, 0],
    ]);
    const pts = v.getLocalPoints();
    expect(pts.length).toBe(4);
    expect(pts[0]).toEqual([0, 0, 0]);
    expect(pts[3]).toEqual([6, 0, 0]);
    expect(pts[1][0]).toBeCloseTo(2);
    expect(pts[2][0]).toBeCloseTo(4);
  });

  it('correctly interpolates handles in 3D', () => {
    const v = new VMobject();
    v.setPointsAsCorners([
      [0, 0, 0],
      [0, 0, 9],
    ]);
    const pts = v.getLocalPoints();
    expect(pts[1][2]).toBeCloseTo(3);
    expect(pts[2][2]).toBeCloseTo(6);
  });
});

describe('VMobject.addPointsAsCorners', () => {
  it('appends new corner segments to existing points', () => {
    const v = new VMobject();
    v.setPointsAsCorners([
      [0, 0, 0],
      [3, 0, 0],
    ]);
    expect(v.getLocalPoints().length).toBe(4);
    v.addPointsAsCorners([[3, 3, 0]]);
    expect(v.getLocalPoints().length).toBe(7);
    expect(v.getLocalPoints()[6]).toEqual([3, 3, 0]);
  });

  it('handles adding to empty VMobject', () => {
    const v = new VMobject();
    v.addPointsAsCorners([[5, 5, 0]]);
    expect(v.getLocalPoints()).toEqual([[5, 5, 0]]);
  });

  it('adds multiple corners sequentially', () => {
    const v = new VMobject();
    v.setPointsAsCorners([
      [0, 0, 0],
      [1, 0, 0],
    ]);
    v.addPointsAsCorners([
      [2, 0, 0],
      [3, 0, 0],
    ]);
    expect(v.getLocalPoints().length).toBe(10);
  });

  it('correctly computes 3D handle positions', () => {
    const v = new VMobject();
    v.setPointsAsCorners([
      [0, 0, 0],
      [0, 0, 0],
    ]);
    v.addPointsAsCorners([[0, 0, 9]]);
    const pts = v.getLocalPoints();
    // Last 3 points are handle1, handle2, anchor for corner at z=9
    expect(pts[pts.length - 3][2]).toBeCloseTo(3);
    expect(pts[pts.length - 2][2]).toBeCloseTo(6);
    expect(pts[pts.length - 1][2]).toBeCloseTo(9);
  });
});

describe('VMobject.interpolate', () => {
  it('at alpha=0 keeps original', () => {
    const v1 = new VMobject();
    v1.setPoints([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
    ]);
    const v2 = new VMobject();
    v2.setPoints([
      [10, 10, 0],
      [11, 10, 0],
      [12, 10, 0],
      [13, 10, 0],
    ]);
    v1.interpolate(v2, 0);
    expect(v1.getLocalPoints()[0][0]).toBeCloseTo(0);
    expect(v1.getLocalPoints()[0][1]).toBeCloseTo(0);
  });

  it('at alpha=1 matches target', () => {
    const v1 = new VMobject();
    v1.setPoints([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
    ]);
    const v2 = new VMobject();
    v2.setPoints([
      [10, 10, 0],
      [11, 10, 0],
      [12, 10, 0],
      [13, 10, 0],
    ]);
    v1.interpolate(v2, 1);
    expect(v1.getLocalPoints()[0][0]).toBeCloseTo(10);
    expect(v1.getLocalPoints()[3][0]).toBeCloseTo(13);
  });

  it('at alpha=0.5 is midpoint', () => {
    const v1 = new VMobject();
    v1.setPoints([
      [0, 0, 0],
      [2, 0, 0],
      [4, 0, 0],
      [6, 0, 0],
    ]);
    const v2 = new VMobject();
    v2.setPoints([
      [10, 10, 0],
      [12, 10, 0],
      [14, 10, 0],
      [16, 10, 0],
    ]);
    v1.interpolate(v2, 0.5);
    expect(v1.getLocalPoints()[0][0]).toBeCloseTo(5);
    expect(v1.getLocalPoints()[0][1]).toBeCloseTo(5);
    expect(v1.getLocalPoints()[3][0]).toBeCloseTo(11);
  });

  it('interpolates style properties', () => {
    const v1 = new VMobject();
    v1.setPoints([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
    ]);
    v1.opacity = 0;
    v1.fillOpacity = 0;
    v1.strokeWidth = 0;
    const v2 = new VMobject();
    v2.setPoints([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
    ]);
    v2.opacity = 1;
    v2.fillOpacity = 1;
    v2.strokeWidth = 10;
    v1.interpolate(v2, 0.5);
    expect(v1.opacity).toBeCloseTo(0.5);
    expect(v1.fillOpacity).toBeCloseTo(0.5);
    expect(v1.strokeWidth).toBeCloseTo(5);
  });

  it('aligns points when counts differ', () => {
    const v1 = new VMobject();
    v1.setPoints([
      [0, 0, 0],
      [1, 0, 0],
    ]);
    const v2 = new VMobject();
    v2.setPoints([
      [10, 0, 0],
      [11, 0, 0],
      [12, 0, 0],
      [13, 0, 0],
    ]);
    v1.interpolate(v2, 0.5);
    expect(v1.getLocalPoints().length).toBe(v2.getLocalPoints().length);
  });

  it('interpolates _style fillOpacity and strokeOpacity', () => {
    const v1 = new VMobject();
    v1.setPoints([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
    ]);
    v1.setStyle({ fillOpacity: 0, strokeOpacity: 0, strokeWidth: 2 });
    const v2 = new VMobject();
    v2.setPoints([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
    ]);
    v2.setStyle({ fillOpacity: 1, strokeOpacity: 1, strokeWidth: 8 });
    v1.interpolate(v2, 0.5);
    const s = v1.style;
    expect(s.fillOpacity).toBeCloseTo(0.5);
    expect(s.strokeOpacity).toBeCloseTo(0.5);
    expect(s.strokeWidth).toBeCloseTo(5);
  });

  it('interpolates position and scale', () => {
    const v1 = new VMobject();
    v1.setPoints([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
    ]);
    v1.position.set(0, 0, 0);
    v1.scaleVector.set(1, 1, 1);
    const v2 = new VMobject();
    v2.setPoints([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
    ]);
    v2.position.set(10, 10, 10);
    v2.scaleVector.set(3, 3, 3);
    v1.interpolate(v2, 0.5);
    expect(v1.position.x).toBeCloseTo(5);
    expect(v1.scaleVector.x).toBeCloseTo(2);
  });
});

describe('VMobject.alignPoints', () => {
  it('does nothing when counts match', () => {
    const v1 = new VMobject();
    v1.setPoints([
      [0, 0, 0],
      [1, 0, 0],
    ]);
    const v2 = new VMobject();
    v2.setPoints([
      [5, 5, 0],
      [6, 6, 0],
    ]);
    v1.alignPoints(v2);
    expect(v1.getLocalPoints().length).toBe(2);
    expect(v2.getLocalPoints().length).toBe(2);
  });

  it('upsamples the shorter VMobject', () => {
    const v1 = new VMobject();
    v1.setPoints([[0, 0, 0]]);
    const v2 = new VMobject();
    v2.setPoints([
      [5, 0, 0],
      [6, 0, 0],
      [7, 0, 0],
      [8, 0, 0],
    ]);
    v1.alignPoints(v2);
    expect(v1.getLocalPoints().length).toBe(4);
  });

  it('handles empty VMobject by filling with zeros', () => {
    const v1 = new VMobject();
    v1.setPoints([]);
    const v2 = new VMobject();
    v2.setPoints([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    v1.alignPoints(v2);
    expect(v1.getLocalPoints().length).toBe(2);
    expect(v1.getLocalPoints()[0]).toEqual([0, 0, 0]);
  });
});

describe('VMobject.getCenter', () => {
  it('returns position when no points', () => {
    const v = new VMobject();
    v.position.set(3, 4, 5);
    expect(v.getCenter()).toEqual([3, 4, 5]);
  });

  it('returns the midpoint of world bounds for non-empty VMobject', () => {
    const v = new VMobject();
    // MIGRATION: weak test, remove once property-based tests done.
    // Collinear control points: bezier curve stays within the hull,
    // so getCenter() (from control-point bounds) agrees with getBounds() (Three.js).
    v.setPoints([
      [0, 0, 0],
      [1, 1, 0],
      [2, 2, 0],
      [3, 3, 0],
    ]);

    const center = v.getCenter();
    const bounds = v.getBounds();
    expect(center[0]).toBeCloseTo((bounds.min.x + bounds.max.x) / 2);
    expect(center[1]).toBeCloseTo((bounds.min.y + bounds.max.y) / 2);
    expect(center[2]).toBeCloseTo((bounds.min.z + bounds.max.z) / 2);
  });

  it('includes position offset', () => {
    const v = new VMobject();
    v.position.set(10, 10, 0);
    v.setPoints([
      [-1, -1, 0],
      [1, 1, 0],
    ]);
    const center = v.getCenter();
    expect(center[0]).toBeCloseTo(10);
    expect(center[1]).toBeCloseTo(10);
  });
});

describe('VMobject.getUnitVector', () => {
  it('returns [1,0,0] when fewer than 2 points', () => {
    const v = new VMobject();
    expect(v.getUnitVector()).toEqual([1, 0, 0]);
    v.setPoints([[5, 5, 0]]);
    expect(v.getUnitVector()).toEqual([1, 0, 0]);
  });

  it('returns normalized direction from first to last point', () => {
    const v = new VMobject();
    v.setPoints([
      [0, 0, 0],
      [3, 4, 0],
    ]);
    const uv = v.getUnitVector();
    const mag = Math.sqrt(uv[0] ** 2 + uv[1] ** 2 + uv[2] ** 2);
    expect(mag).toBeCloseTo(1);
    expect(uv[0]).toBeCloseTo(0.6);
    expect(uv[1]).toBeCloseTo(0.8);
  });

  it('returns [1,0,0] for coincident endpoints', () => {
    const v = new VMobject();
    v.setPoints([
      [3, 3, 3],
      [3, 3, 3],
    ]);
    expect(v.getUnitVector()).toEqual([1, 0, 0]);
  });
});

describe('VMobject.copy', () => {
  it('creates deep copy with same points and style', () => {
    const v = new VMobject();
    v.setPoints([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    v.setColor('#ff0000');
    v.setStrokeOpacity(0.7);
    v.fillOpacity = 0.3;
    v.strokeWidth = 8;
    const c = v.copy() as VMobject;
    expect(c.getLocalPoints()).toEqual(v.getLocalPoints());
    expect(c.color.toLowerCase()).toBe('#ff0000');
    expect(c.opacity).toBeCloseTo(0.7);
    expect(c.fillOpacity).toBe(0.3);
    expect(c.strokeWidth).toBe(8);
  });

  it('copy is independent from original', () => {
    const v = new VMobject();
    v.setPoints([[1, 0, 0]]);
    const c = v.copy() as VMobject;
    c.setPoints([[99, 99, 99]]);
    expect(v.getLocalPoints()[0][0]).toBe(1);
  });

  it('preserves visiblePointCount', () => {
    const v = new VMobject();
    v.setPoints([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
    ]);
    v.visiblePointCount = 2;
    const c = v.copy() as VMobject;
    expect(c.visiblePointCount).toBe(2);
  });
});

describe('VMobject._toLinewidth (static)', () => {
  it('converts strokeWidth to pixel linewidth', () => {
    const lw = VMobject._toLinewidth(4);
    expect(lw).toBeCloseTo(4 * 0.01 * (800 / 14));
  });

  it('returns 0 for strokeWidth=0', () => {
    expect(VMobject._toLinewidth(0)).toBe(0);
  });

  it('scales linearly', () => {
    const lw1 = VMobject._toLinewidth(2);
    const lw2 = VMobject._toLinewidth(4);
    expect(lw2).toBeCloseTo(lw1 * 2);
  });
});

describe('VMobject.shaderCurves', () => {
  it('defaults to class-level useShaderCurves', () => {
    const saved = VMobject.useShaderCurves;
    try {
      VMobject.useShaderCurves = false;
      const v = new VMobject();
      expect(v.shaderCurves).toBe(false);
      VMobject.useShaderCurves = true;
      expect(v.shaderCurves).toBe(true);
    } finally {
      VMobject.useShaderCurves = saved;
    }
  });

  it('per-instance override takes precedence', () => {
    const saved = VMobject.useShaderCurves;
    try {
      VMobject.useShaderCurves = false;
      const v = new VMobject();
      v.shaderCurves = true;
      expect(v.shaderCurves).toBe(true);
      v.shaderCurves = null;
      expect(v.shaderCurves).toBe(false);
    } finally {
      VMobject.useShaderCurves = saved;
    }
  });
});

describe('VMobject.dispose', () => {
  it('does not throw on empty VMobject', () => {
    expect(() => new VMobject().dispose()).not.toThrow();
  });

  it('does not throw on VMobject with points', () => {
    const v = new VMobject();
    v.setPoints([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
    ]);
    expect(() => v.dispose()).not.toThrow();
  });

  it('disposes _cachedLine2 geometry before nulling', () => {
    const v = new VMobject();
    v.setPoints([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
    ]);
    v.strokeWidth = 2;
    v._syncToThree();
    const cachedLine = (v as any)._cachedLine2;
    expect(cachedLine).not.toBeNull();
    const disposeSpy = vi.spyOn(cachedLine.geometry, 'dispose');
    v.dispose();
    expect(disposeSpy).toHaveBeenCalled();
    expect((v as any)._cachedLine2).toBeNull();
  });
});

describe('VMobject.useStrokeMesh', () => {
  it('defaults to false', () => {
    expect(new VMobject().useStrokeMesh).toBe(false);
  });

  it('can be toggled', () => {
    const v = new VMobject();
    v.useStrokeMesh = true;
    expect(v.useStrokeMesh).toBe(true);
  });
});

describe('VMobject static properties', () => {
  it('_rendererWidth and _rendererHeight have defaults', () => {
    expect(VMobject._rendererWidth).toBe(800);
    expect(VMobject._rendererHeight).toBe(450);
  });

  it('_frameWidth has default', () => {
    expect(VMobject._frameWidth).toBe(14);
  });

  it('useShaderCurves defaults to false', () => {
    expect(VMobject.useShaderCurves).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Per-instance scene context (_setSceneContext / multi-scene support)
// ---------------------------------------------------------------------------

describe('VMobject per-instance scene context', () => {
  it('_setSceneContext overrides static defaults for linewidth', () => {
    const v = new VMobject();
    // Without scene context, uses static defaults (800/14)
    const defaultLw = (v as any)._computeLinewidth(4);
    expect(defaultLw).toBeCloseTo(4 * 0.01 * (800 / 14));

    // Set per-instance context with different dimensions
    v._setSceneContext(1600, 900, 28);
    const overriddenLw = (v as any)._computeLinewidth(4);
    expect(overriddenLw).toBeCloseTo(4 * 0.01 * (1600 / 28));

    // Static method still uses class-level statics
    expect(VMobject._toLinewidth(4)).toBeCloseTo(
      4 * 0.01 * (VMobject._rendererWidth / VMobject._frameWidth),
    );
  });

  it('per-instance context does not affect other VMobjects', () => {
    const v1 = new VMobject();
    const v2 = new VMobject();

    v1._setSceneContext(1920, 1080, 14);
    // v2 still uses static defaults (800/14)
    const v2Lw = (v2 as any)._computeLinewidth(4);
    expect(v2Lw).toBeCloseTo(4 * 0.01 * (VMobject._rendererWidth / VMobject._frameWidth));

    const v1Lw = (v1 as any)._computeLinewidth(4);
    expect(v1Lw).toBeCloseTo(4 * 0.01 * (1920 / 14));
    expect(v1Lw).not.toBeCloseTo(v2Lw);
  });

  it('two scenes with different sizes produce different linewidths', () => {
    // Simulate Scene A: 800x450, frameWidth=14
    const vA = new VMobject();
    vA._setSceneContext(800, 450, 14);

    // Simulate Scene B: 1920x1080, frameWidth=14
    const vB = new VMobject();
    vB._setSceneContext(1920, 1080, 14);

    const lwA = (vA as any)._computeLinewidth(4);
    const lwB = (vB as any)._computeLinewidth(4);

    expect(lwA).toBeCloseTo(4 * 0.01 * (800 / 14));
    expect(lwB).toBeCloseTo(4 * 0.01 * (1920 / 14));
    expect(lwA).not.toBeCloseTo(lwB);
  });

  it('falls back to statics when scene context is null', () => {
    const v = new VMobject();
    expect(v._sceneRendererWidth).toBeNull();
    expect(v._sceneRendererHeight).toBeNull();
    expect(v._sceneFrameWidth).toBeNull();

    const lw = (v as any)._computeLinewidth(4);
    expect(lw).toBeCloseTo(VMobject._toLinewidth(4));
  });

  it('_setSceneContext updates all three fields', () => {
    const v = new VMobject();
    v._setSceneContext(1024, 768, 10);
    expect(v._sceneRendererWidth).toBe(1024);
    expect(v._sceneRendererHeight).toBe(768);
    expect(v._sceneFrameWidth).toBe(10);
  });

  it('second scene does not corrupt first scene VMobject linewidth', () => {
    const savedW = VMobject._rendererWidth;
    const savedH = VMobject._rendererHeight;
    const savedF = VMobject._frameWidth;

    try {
      // Scene A creates a VMobject with its context
      const vA = new VMobject();
      vA._setSceneContext(800, 450, 14);

      // Scene B overwrites the statics (simulating Scene constructor)
      VMobject._rendererWidth = 1920;
      VMobject._rendererHeight = 1080;
      VMobject._frameWidth = 14;

      // vA's linewidth should still use its per-instance context, NOT the new statics
      const lwA = (vA as any)._computeLinewidth(4);
      expect(lwA).toBeCloseTo(4 * 0.01 * (800 / 14));

      // A VMobject without scene context WOULD use the corrupted statics
      const vNoContext = new VMobject();
      const lwNoContext = (vNoContext as any)._computeLinewidth(4);
      expect(lwNoContext).toBeCloseTo(4 * 0.01 * (1920 / 14));
    } finally {
      VMobject._rendererWidth = savedW;
      VMobject._rendererHeight = savedH;
      VMobject._frameWidth = savedF;
    }
  });
});

// ---------------------------------------------------------------------------
// getNumCurves / getNthCurve / curvesAsSubmobjects / CurvesAsSubmobjects
// ---------------------------------------------------------------------------

describe('getNumCurves', () => {
  it('returns 0 for fewer than 4 points', () => {
    const v = new VMobject();
    expect(getNumCurves(v)).toBe(0);
    v.setPoints([[0, 0, 0]]);
    expect(getNumCurves(v)).toBe(0);
    v.setPoints([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
    ]);
    expect(getNumCurves(v)).toBe(0);
  });

  it('returns 1 for exactly 4 points', () => {
    const v = new VMobject();
    v.setPoints([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
    ]);
    expect(getNumCurves(v)).toBe(1);
  });

  it('returns 2 for 7 points', () => {
    const v = new VMobject();
    v.setPointsAsCorners([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
    ]);
    expect(getNumCurves(v)).toBe(2);
  });

  it('returns correct count for larger paths', () => {
    const v = new VMobject();
    v.setPoints(Array.from({ length: 10 }, (_, i) => [i, 0, 0]));
    expect(getNumCurves(v)).toBe(3);
  });
});

describe('getNthCurve', () => {
  it('extracts correct curve segments', () => {
    const v = new VMobject();
    v.setPoints([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
      [4, 0, 0],
      [5, 0, 0],
      [6, 0, 0],
    ]);
    const c0 = getNthCurve(v, 0);
    expect(c0.getLocalPoints()[0]).toEqual([0, 0, 0]);
    expect(c0.getLocalPoints()[3]).toEqual([3, 0, 0]);

    const c1 = getNthCurve(v, 1);
    expect(c1.getLocalPoints()[0]).toEqual([3, 0, 0]);
    expect(c1.getLocalPoints()[3]).toEqual([6, 0, 0]);
  });

  it('copies style from source', () => {
    const v = new VMobject();
    v.setPoints([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
    ]);
    v.setColor('#ff0000');
    v.setStrokeOpacity(0.5);
    v.setStrokeWidth(8);
    v.setFillOpacity(0.3);
    const c = getNthCurve(v, 0);
    expect(c.color.toLowerCase()).toBe('#ff0000');
    expect(c.opacity).toBeCloseTo(0.5);
    expect(c.strokeWidth).toBe(8);
    expect(c.fillOpacity).toBeCloseTo(0.3);
  });

  it('throws for out-of-range index', () => {
    const v = new VMobject();
    v.setPoints([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
    ]);
    expect(() => getNthCurve(v, -1)).toThrow();
    expect(() => getNthCurve(v, 1)).toThrow();
  });
});

describe('curvesAsSubmobjects (function)', () => {
  it('splits a VMobject into curve children', () => {
    const v = new VMobject();
    v.setPoints([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
      [4, 0, 0],
      [5, 0, 0],
      [6, 0, 0],
    ]);
    const parent = curvesAsSubmobjects(v);
    expect(parent.children.length).toBe(2);
  });

  it('copies transform', () => {
    const v = new VMobject();
    v.setPoints([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
    ]);
    v.position.set(5, 6, 7);
    v.scaleVector.set(2, 2, 2);
    const parent = curvesAsSubmobjects(v);
    expect(parent.position.x).toBe(5);
    expect(parent.scaleVector.x).toBe(2);
  });

  it('parent has no own points and zero fill opacity', () => {
    const v = new VMobject();
    v.setPoints([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
    ]);
    const parent = curvesAsSubmobjects(v);
    expect(parent.numPoints).toBe(0);
    expect(parent.fillOpacity).toBe(0);
  });
});

describe('CurvesAsSubmobjects class', () => {
  it('constructor with VMobject splits into children', () => {
    const v = new VMobject();
    v.setPoints([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
      [4, 0, 0],
      [5, 0, 0],
      [6, 0, 0],
    ]);
    const cas = new CurvesAsSubmobjects(v);
    expect(cas.numCurves).toBe(2);
  });

  it('constructor without VMobject creates empty', () => {
    const cas = new CurvesAsSubmobjects();
    expect(cas.numCurves).toBe(0);
    expect(cas.fillOpacity).toBe(0);
  });

  it('getCurve returns correct child', () => {
    const v = new VMobject();
    v.setPoints([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
      [4, 0, 0],
      [5, 0, 0],
      [6, 0, 0],
    ]);
    const cas = new CurvesAsSubmobjects(v);
    expect(cas.getCurve(0).getLocalPoints()[0]).toEqual([0, 0, 0]);
    expect(cas.getCurve(1).getLocalPoints()[0]).toEqual([3, 0, 0]);
  });

  it('getCurve throws for out-of-range', () => {
    const cas = new CurvesAsSubmobjects();
    expect(() => cas.getCurve(0)).toThrow();
    expect(() => cas.getCurve(-1)).toThrow();
  });

  it('forEach iterates over curves', () => {
    const v = new VMobject();
    v.setPoints([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
      [4, 0, 0],
      [5, 0, 0],
      [6, 0, 0],
    ]);
    const cas = new CurvesAsSubmobjects(v);
    const indices: number[] = [];
    cas.forEach((_c, i) => indices.push(i));
    expect(indices).toEqual([0, 1]);
  });

  it('map returns mapped values', () => {
    const v = new VMobject();
    v.setPoints([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
      [4, 0, 0],
      [5, 0, 0],
      [6, 0, 0],
    ]);
    const cas = new CurvesAsSubmobjects(v);
    const firstPts = cas.map((c) => c.getLocalPoints()[0]);
    expect(firstPts[0]).toEqual([0, 0, 0]);
    expect(firstPts[1]).toEqual([3, 0, 0]);
  });

  it('Symbol.iterator works with for-of', () => {
    const v = new VMobject();
    v.setPoints([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
      [4, 0, 0],
      [5, 0, 0],
      [6, 0, 0],
    ]);
    const cas = new CurvesAsSubmobjects(v);
    const collected: VMobject[] = [];
    for (const c of cas) collected.push(c);
    expect(collected.length).toBe(2);
  });

  it('setFromVMobject replaces existing children', () => {
    const v1 = new VMobject();
    v1.setPoints([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
    ]);
    const v2 = new VMobject();
    v2.setPoints([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
      [4, 0, 0],
      [5, 0, 0],
      [6, 0, 0],
    ]);
    const cas = new CurvesAsSubmobjects(v1);
    expect(cas.numCurves).toBe(1);
    cas.setFromVMobject(v2);
    expect(cas.numCurves).toBe(2);
  });

  it('setFromVMobject copies transform', () => {
    const v = new VMobject();
    v.setPoints([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
    ]);
    v.position.set(5, 6, 7);
    v.scaleVector.set(2, 3, 4);
    const cas = new CurvesAsSubmobjects();
    cas.setFromVMobject(v);
    expect(cas.position.x).toBe(5);
    expect(cas.scaleVector.y).toBe(3);
  });

  it('copy() returns a CurvesAsSubmobjects', () => {
    const v = new VMobject();
    v.setPoints([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
    ]);
    const cas = new CurvesAsSubmobjects(v);
    const copy = cas.copy();
    expect(copy).toBeInstanceOf(CurvesAsSubmobjects);
  });
});

describe('VMobject._interpolatePointList3D (via alignPoints)', () => {
  it('handles empty input by filling with zeros', () => {
    const v1 = new VMobject();
    v1.setPoints([]);
    const v2 = new VMobject();
    v2.setPoints([
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
    ]);
    v1.alignPoints(v2);
    expect(v1.getLocalPoints().length).toBe(3);
    expect(v1.getLocalPoints()[0]).toEqual([0, 0, 0]);
  });

  it('handles single point input by repeating', () => {
    const v1 = new VMobject();
    v1.setPoints([[5, 5, 5]]);
    const v2 = new VMobject();
    v2.setPoints([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
    ]);
    v1.alignPoints(v2);
    expect(v1.getLocalPoints().length).toBe(3);
    for (const p of v1.getLocalPoints()) {
      expect(p).toEqual([5, 5, 5]);
    }
  });

  it('interpolates between two points to target count', () => {
    const v1 = new VMobject();
    v1.setPoints([
      [0, 0, 0],
      [10, 0, 0],
    ]);
    const v2 = new VMobject();
    v2.setPoints([
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ]);
    v1.alignPoints(v2);
    const pts = v1.getLocalPoints();
    expect(pts.length).toBe(5);
    expect(pts[0][0]).toBeCloseTo(0);
    expect(pts[4][0]).toBeCloseTo(10);
    expect(pts[2][0]).toBeCloseTo(5);
  });
});

describe('resamplePointList3D – corner-tangent regression', () => {
  // A square in 3n+1 cubic-bezier format (4 straight-line segments, sideLength=2).
  // Resampling it to 25 pts (ratio 2:1) places new anchors exactly on the original
  // curve boundaries (the corners).  The bug: buildSubCubic used the wrong tangent
  // at those boundaries, producing handles that bulge outside the square.
  //
  // For every straight-line segment the handles must lie on the segment itself,
  // i.e. h1 = anchor_start + 1/3*(anchor_end - anchor_start) and similarly h2.
  // We verify that every handle in the 25-pt result is collinear with its two
  // surrounding anchors (within floating-point tolerance).

  it('resampling a square 13→25 keeps all handles collinear with their anchors', () => {
    const TL = [-1, 1, 0],
      TR = [1, 1, 0],
      BR = [1, -1, 0],
      BL = [-1, -1, 0];
    function seg(p0: number[], p1: number[]): number[][] {
      return [
        [p0[0] + (p1[0] - p0[0]) / 3, p0[1] + (p1[1] - p0[1]) / 3, 0],
        [p0[0] + (2 * (p1[0] - p0[0])) / 3, p0[1] + (2 * (p1[1] - p0[1])) / 3, 0],
        [...p1],
      ];
    }
    const sq13 = [TL, ...seg(TL, TR), ...seg(TR, BR), ...seg(BR, BL), ...seg(BL, TL)];
    expect(sq13.length).toBe(13);

    const v1 = new VMobject();
    v1.setPoints(sq13);
    const v2 = new VMobject();
    // 25-pt target to force resample (same count as a Python Circle with 8 arcs)
    v2.setPoints(Array.from({ length: 25 }, (_, i) => [i, 0, 0]));

    v1.alignPoints(v2);
    const pts = v1.getLocalPoints();
    expect(pts.length).toBe(25);

    // Every triplet [anchor, h1, h2, anchor] must be collinear.
    // Cross product of (h-anchor_start) × (anchor_end - anchor_start) must be ~0.
    for (let i = 0; i + 3 < pts.length; i += 3) {
      const a0 = pts[i],
        h1 = pts[i + 1],
        h2 = pts[i + 2],
        a1 = pts[i + 3];
      const edgeX = a1[0] - a0[0],
        edgeY = a1[1] - a0[1];
      // cross product z-component: edge × (h - a0)
      const cross1 = edgeX * (h1[1] - a0[1]) - edgeY * (h1[0] - a0[0]);
      const cross2 = edgeX * (h2[1] - a0[1]) - edgeY * (h2[0] - a0[0]);
      expect(Math.abs(cross1)).toBeCloseTo(0, 10);
      expect(Math.abs(cross2)).toBeCloseTo(0, 10);
    }
  });
});

describe('VMobject style optimization (no-op dirty checks)', () => {
  it('setStrokeOpacity does not mark dirty if value unchanged', () => {
    const v = new VMobject();
    v.setStrokeOpacity(0.5);
    v._dirty = false;
    v.setStrokeOpacity(0.5);
    expect(v._dirty).toBe(false);
  });

  it('setStrokeWidth does not mark dirty if value unchanged', () => {
    const v = new VMobject();
    v.setStrokeWidth(4);
    v._dirty = false;
    v.setStrokeWidth(4);
    expect(v._dirty).toBe(false);
  });

  it('setFillOpacity does not mark dirty if value unchanged', () => {
    const v = new VMobject();
    v.setFillOpacity(0.5);
    v._dirty = false;
    v.setFillOpacity(0.5);
    expect(v._dirty).toBe(false);
  });

  it('setColor does not mark dirty if value unchanged', () => {
    const v = new VMobject();
    v.setColor('#ff0000');
    v._dirty = false;
    v.setColor('#ff0000');
    expect(v._dirty).toBe(false);
  });

  it('fillColor setter does not mark dirty if unchanged', () => {
    const v = new VMobject();
    v.fillColor = '#abcdef';
    v._dirty = false;
    v.fillColor = '#abcdef';
    expect(v._dirty).toBe(false);
  });
});

describe('VMobject color setter syncs _style', () => {
  it('color setter syncs strokeColor and fillColor', () => {
    const v = new VMobject();
    v.color = '#123456';
    const s = v.style;
    expect(s.strokeColor).toBe('#123456');
    expect(s.fillColor).toBe('#123456');
  });
});

describe('VMobject chaining (all methods)', () => {
  it('setPoints returns this', () => {
    const v = new VMobject();
    expect(v.setPoints([[0, 0, 0]])).toBe(v);
  });

  it('setPoints3D returns this', () => {
    const v = new VMobject();
    expect(v.setPoints3D([[0, 0, 0]])).toBe(v);
  });

  it('addPoints returns this', () => {
    const v = new VMobject();
    expect(v.addPoints({ x: 0, y: 0 })).toBe(v);
  });

  it('clearPoints returns this', () => {
    expect(new VMobject().clearPoints()).toBeInstanceOf(VMobject);
  });

  it('setPointsAsCorners returns this', () => {
    const v = new VMobject();
    expect(
      v.setPointsAsCorners([
        [0, 0, 0],
        [1, 0, 0],
      ]),
    ).toBe(v);
  });

  it('addPointsAsCorners returns this', () => {
    const v = new VMobject();
    v.setPoints([[0, 0, 0]]);
    expect(v.addPointsAsCorners([[1, 0, 0]])).toBe(v);
  });

  it('interpolate returns this', () => {
    const v1 = new VMobject();
    v1.setPoints([
      [0, 0, 0],
      [1, 0, 0],
    ]);
    const v2 = new VMobject();
    v2.setPoints([
      [5, 0, 0],
      [6, 0, 0],
    ]);
    expect(v1.interpolate(v2, 0.5)).toBe(v1);
  });

  it('setColor returns this', () => {
    expect(new VMobject().setColor('#ff0000')).toBeInstanceOf(VMobject);
  });

  it('setStrokeOpacity returns this', () => {
    expect(new VMobject().setStrokeOpacity(0.5)).toBeInstanceOf(VMobject);
  });

  it('setStrokeWidth returns this', () => {
    expect(new VMobject().setStrokeWidth(6)).toBeInstanceOf(VMobject);
  });

  it('setFillOpacity returns this', () => {
    expect(new VMobject().setFillOpacity(0.5)).toBeInstanceOf(VMobject);
  });

  it('setFill returns this', () => {
    expect(new VMobject().setFill('#ff0000', 0.5)).toBeInstanceOf(VMobject);
  });

  it('setStyle returns this', () => {
    expect(new VMobject().setStyle({ strokeWidth: 6 })).toBeInstanceOf(VMobject);
  });
});

describe('VMobject become', () => {
  it('copies all visual properties from another VMobject', () => {
    const v1 = new VMobject();
    v1.setPoints([
      [0, 0, 0],
      [1, 0, 0],
    ]);
    const v2 = new VMobject();
    v2.setPoints([
      [10, 10, 0],
      [20, 20, 0],
    ]);
    v2.setColor('#ff0000');
    v2.setStrokeOpacity(0.3);
    v2.strokeWidth = 12;
    v2.fillOpacity = 0.7;
    v2.position.set(5, 6, 7);
    v1.become(v2);
    expect(v1.getLocalPoints()).toEqual(v2.getLocalPoints());
    expect(v1.color.toLowerCase()).toBe('#ff0000');
    expect(v1.opacity).toBeCloseTo(0.3);
    expect(v1.strokeWidth).toBe(12);
    expect(v1.fillOpacity).toBe(0.7);
    expect(v1.position.x).toBe(5);
  });
});

describe('VMobject saveState / restoreState', () => {
  it('saves and restores full state', () => {
    const v = new VMobject();
    v.setPoints([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
    ]);
    v.position.set(1, 2, 3);
    v.setColor('#ff0000');
    v.setStrokeOpacity(0.5);
    v.saveState();
    v.position.set(99, 99, 99);
    v.setColor('#00ff00');
    v.setStrokeOpacity(1);
    v.setPoints([[5, 5, 5]]);
    expect(v.restoreState()).toBe(true);
    expect(v.position.x).toBe(1);
    expect(v.color.toLowerCase()).toBe('#ff0000');
    expect(v.opacity).toBeCloseTo(0.5);
    expect(v.getLocalPoints().length).toBe(4);
  });

  it('restoreState returns false if no saved state', () => {
    expect(new VMobject().restoreState()).toBe(false);
  });
});

describe('VMobject Mobject operations', () => {
  it('add/remove children', () => {
    const parent = new VMobject();
    const child = new VMobject();
    parent.add(child);
    expect(parent.submobjects).toContain(child);
    expect(child.parent).toBe(parent);
    parent.remove(child);
    expect(parent.submobjects).not.toContain(child);
  });

  it('getFamily includes self and descendants', () => {
    const parent = new VMobject();
    const c1 = new VMobject();
    const c2 = new VMobject();
    parent.add(c1, c2);
    const family = parent.getFamily();
    expect(family).toContain(parent);
    expect(family).toContain(c1);
    expect(family).toContain(c2);
    expect(family.length).toBe(3);
  });

  describe('familyMembersWithPoints (Manim CE stagger unit)', () => {
    it('a lone VMobject with points is its own single family member', () => {
      const v = new VMobject();
      v.setPoints([
        [0, 0, 0],
        [1, 0, 0],
      ]);
      expect(v.familyMembersWithPoints()).toEqual([v]);
    });

    it('excludes containers that hold no points of their own (VGroup/DashedLine pattern)', () => {
      const container = new VMobject(); // never given points: acts like a VGroup/DashedLine shell
      const c1 = new VMobject();
      c1.setPoints([
        [0, 0, 0],
        [1, 0, 0],
      ]);
      const c2 = new VMobject();
      c2.setPoints([
        [2, 0, 0],
        [3, 0, 0],
      ]);
      container.add(c1, c2);
      expect(container.familyMembersWithPoints()).toEqual([c1, c2]);
    });

    it('a VMobject with multiple internal subpaths is still exactly ONE stagger unit', () => {
      // Regression for the Create lagRatio bug: subpaths of a single VMobject
      // (e.g. a glyph with a hole) must never be counted as separate family
      // members, no matter how many subpaths setBaseSubpathLengths declares.
      const v = new VMobject();
      v.setPoints([
        [0, 0, 0],
        [0.3, 0, 0],
        [0.7, 0, 0],
        [1, 0, 0],
        [2, 0, 0],
        [2.3, 0, 0],
        [2.7, 0, 0],
        [3, 0, 0],
      ]);
      v.setBaseSubpathLengths([4, 4]); // 2 subpaths, 1 mobject
      expect(v.familyMembersWithPoints()).toEqual([v]);
    });

    it('excludes a real VGroup container itself, despite VGroup.getLocalPoints() aggregating children', () => {
      // Regression: VGroup overrides getLocalPoints() to aggregate its
      // children's points (for Homotopy/ApplyWave-style transforms), which
      // must NOT make the VGroup itself look like a stagger unit with its
      // own points. Caught by real-browser validation of bug #544's fix.
      const c1 = new VMobject();
      c1.setPoints([
        [0, 0, 0],
        [1, 0, 0],
      ]);
      const c2 = new VMobject();
      c2.setPoints([
        [2, 0, 0],
        [3, 0, 0],
      ]);
      const group = new VGroup(c1, c2);
      expect(group.getLocalPoints().length).toBeGreaterThan(0); // the aggregation itself
      expect(group.familyMembersWithPoints()).toEqual([c1, c2]); // but NOT counted as a member
    });

    it('does not include descendants once a subpath-bearing container has children too', () => {
      // Sanity check: the filter is per-node (getLocalPoints), not "has no children".
      const v = new VMobject();
      v.setPoints([
        [0, 0, 0],
        [1, 0, 0],
      ]);
      const child = new VMobject();
      child.setPoints([
        [2, 0, 0],
        [3, 0, 0],
      ]);
      v.add(child);
      expect(v.familyMembersWithPoints()).toEqual([v, child]);
    });
  });

  it('generateTarget creates independent copy', () => {
    const v = new VMobject();
    v.setPoints([
      [0, 0, 0],
      [1, 0, 0],
    ]);
    const target = v.generateTarget();
    expect(v.targetCopy).toBe(target);
    target.shift([10, 0, 0]);
    expect(v.position.x).toBe(0);
  });

  it('opacity setter clamps values', () => {
    const v = new VMobject();
    v.opacity = 1.5;
    expect(v.opacity).toBe(1);
    v.opacity = -0.5;
    expect(v.opacity).toBe(0);
  });
});
