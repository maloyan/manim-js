/**
 * Vectorized Mobject - a mobject defined by cubic Bezier curves.
 * This is the base class for all path-based shapes.
 *
 * Points are stored as cubic Bezier control points:
 * [anchor1, handle1, handle2, anchor2, handle3, handle4, anchor3, ...]
 *
 * Each curve segment uses 4 points: anchor -> handle -> handle -> anchor
 * Consecutive segments share the anchor point.
 */

import * as THREE from 'three';
import { Mobject, Vector3Tuple } from './Mobject';
import { isVMobject } from './MobjectTypes';
import { VMobjectRendering } from './VMobjectRendering';
import { lerp, lerpPoint as lerpPoint3D, signedArea2DFromStride } from '../utils/math';
import type { Point } from './VMobjectCurves';

import { resamplePointList3D } from './VMobjectTransformAlignment';
import { computePointBounds } from './PointBounds';

// Re-export Point type so existing `import { Point } from './VMobject'` keeps working.
export type { Point } from './VMobjectCurves';

/**
 * Vectorized mobject class for path-based shapes.
 */
export class VMobject extends VMobjectRendering {
  /**
   * Array of cubic Bezier control points in 3D.
   * Each point is [x, y, z].
   * Stored as: [anchor1, handle1, handle2, anchor2, handle3, handle4, anchor3, ...]
   */
  protected _points3D: number[][] = [];

  /** Number of points visible (for Create animation) */
  protected _visiblePointCount: number | null = null;

  /** Base subpath-length metadata (intrinsic topology, e.g. SVG compound paths). */
  protected _baseSubpathLengths?: number[];

  /** Transform-time override for subpath lengths (compound-path metadata). */
  protected _transformSubpathLengths?: number[];

  constructor() {
    super();
    this._isVMobject = true;
    // VMobjects have visible fill by default
    this.fillOpacity = 0.5;
    this._style.fillOpacity = 0.5;
    this._style.strokeOpacity = 1;
  }

  override isEmpty(): boolean {
    if (this.getLocalPoints().length > 0) {
      return false;
    }
    return this.children.every((child) => child.isEmpty());
  }

  // -----------------------------------------------------------------------
  // Point access
  // -----------------------------------------------------------------------

  /**
   * Get all points as 2D Point objects (derived from _points3D)
   */
  get points(): Point[] {
    return this._points3D.map((p) => ({ x: p[0], y: p[1] }));
  }

  /**
   * Set the points defining this VMobject.
   * Accepts either Point[] ({x, y} objects) or number[][] ([x, y, z] arrays).
   * @param points - Array of points in either format
   * @returns this for chaining
   */
  setPoints(points: Point[] | number[][]): this {
    if (points.length === 0) {
      this._points3D = [];
    } else if (Array.isArray(points[0])) {
      // points is number[][]
      const points3D = points as number[][];
      this._points3D = points3D.map((p) => [...p]);
    } else {
      // points is Point[]
      const points2D = points as Point[];
      this._points3D = points2D.map((p) => [p.x, p.y, 0]);
    }
    this._visiblePointCount = null;
    this._geometryDirty = true;
    // Propagate dirty upward so parent containers (e.g. Group holding grid
    // lines) are traversed by _syncToThree and children's geometry rebuilds.
    this._markDirtyUpward();
    return this;
  }

  /**
   * Set the points defining this VMobject using 3D arrays (alias for setPoints with number[][])
   * @param points - Array of [x, y, z] control points for cubic Bezier curves
   * @returns this for chaining
   */
  setPoints3D(points: number[][]): this {
    return this.setPoints(points);
  }

  /**
   * Own points in parent-local space — raw _points3D, no ancestor transforms.
   *
   * @post result[i] === _points3D[i]
   */
  getLocalPoints(): number[][] {
    return this._points3D.map((p) => [...p]);
  }

  /**
   * Whether this exact node owns drawable geometry (its raw `_points3D`),
   * bypassing any subclass override of `getLocalPoints()`. VGroup (and every
   * class extending it — MathTex, SVGMobject, Arrow, Table, ...) overrides
   * `getLocalPoints()` to aggregate its children's points for read-modify-write
   * transforms (Homotopy, ApplyWave, ...); that aggregation must NOT make the
   * container itself look like a stagger unit with points of its own.
   */
  protected _hasOwnPoints(): boolean {
    return this._points3D.length > 0;
  }

  /**
   * Public counterpart to {@link _hasOwnPoints}. Lets code outside the
   * VMobject hierarchy (Transform's strategy selection, leaf-snapshot
   * traversal) distinguish "this node carries its own geometry" from
   * "this node delegates entirely to VMobject children" — true not just
   * for VGroup, but for any VMobject subclass that clears its own points
   * and renders via children (DashedLine, a multi-component
   * RegularPolygram, ...).
   */
  hasOwnPoints(): boolean {
    return this._hasOwnPoints();
  }

  /**
   * Own points in world coordinates (full ancestor S/R/T chain; render-only
   * z-layering offset excluded). Children's points are not included — use
   * {@link getAllPoints} for the full subtree.
   *
   * @post result[i] === worldMatrix * _points3D[i]
   * @post this.parent === null => result === getLocalPoints()
   */
  getPoints(): number[][] {
    const worldMatrix = this._worldMatrix();
    const scratch = new THREE.Vector3();
    return this._points3D.map((p) => {
      scratch.set(p[0], p[1], p[2]).applyMatrix4(worldMatrix);
      return [scratch.x, scratch.y, scratch.z];
    });
  }

  /**
   * World-space points from this node and all VMobject descendants recursively.
   *
   * Equivalent to Python manim's get_all_points(). Use this for bounding-box
   * and center queries that must cover the full subtree.
   *
   * @post result === flatMap(this + vmobjectDescendants, m => m.getPoints())
   */
  getAllPoints(): number[][] {
    const result: number[][] = [];
    const collect = (mob: Mobject) => {
      if (mob instanceof VMobject) result.push(...mob.getPoints());
      for (const child of mob.children) collect(child);
    };
    collect(this);
    return result;
  }

  /**
   * Family members (including self) that own points directly — Manim CE's
   * `family_members_with_points()`. This is the unit that staggered animations
   * (e.g. Create's lagRatio) should iterate over: a VMobject with several
   * internal subpaths is still ONE entry here, never split per subpath.
   *
   * @post result === this.getFamily().filter(m => m instanceof VMobject && m._hasOwnPoints())
   */
  familyMembersWithPoints(): VMobject[] {
    return this.getFamily().filter(
      (m): m is VMobject => m instanceof VMobject && m._hasOwnPoints(),
    );
  }

  /**
   * @pre  fn(pts).length === pts.length
   * @post getPoints()[i] === fn(old.getPoints().map(p => p - aboutPoint))[i] + aboutPoint
   */
  protected override _applyFunctionAboutPoint(
    fn: (pts: number[][]) => number[][],
    aboutPoint: number[],
  ): void {
    const pts = this.getPoints();
    if (pts.length === 0) return;
    const shifted = pts.map((p) => [
      p[0] - aboutPoint[0],
      p[1] - aboutPoint[1],
      p[2] - aboutPoint[2],
    ]);
    const worldResult = fn(shifted).map((p) => [
      p[0] + aboutPoint[0],
      p[1] + aboutPoint[1],
      p[2] + aboutPoint[2],
    ]);
    const inverseWorld = this._worldMatrix().clone().invert();
    const scratch = new THREE.Vector3();
    const localPts = worldResult.map((p) => {
      scratch.set(p[0], p[1], p[2]).applyMatrix4(inverseWorld);
      return [scratch.x, scratch.y, scratch.z];
    });
    this.setPoints(localPts);
  }

  /**
   * Get the number of points
   */
  get numPoints(): number {
    return this._points3D.length;
  }

  /**
   * Get the number of visible points (for Create animation)
   */
  get visiblePointCount(): number {
    return this._visiblePointCount ?? this._points3D.length;
  }

  /**
   * Set the number of visible points (for Create animation)
   */
  set visiblePointCount(count: number) {
    this._visiblePointCount = Math.max(0, Math.min(this._points3D.length, count));
    this._geometryDirty = true;
    this._markDirty();
  }

  /**
   * Get points that should be visible (for rendering) as 2D Points
   */
  getVisiblePoints(): Point[] {
    const count = this.visiblePointCount;
    return this._points3D.slice(0, count).map((p) => ({ x: p[0], y: p[1] }));
  }

  /**
   * Get points that should be visible (for rendering) as 3D arrays
   */
  getVisiblePoints3D(): number[][] {
    const count = this.visiblePointCount;
    return this._points3D.slice(0, count).map((p) => [...p]);
  }

  /**
   * Set visible point count for progressive creation animations.
   * Use null to show all points.
   */
  setVisiblePointCount(count: number | null): void {
    this._visiblePointCount = count;
    this._geometryDirty = true;
    this._markDirty();
  }

  /**
   * Get the visible point count (null means all points visible).
   */
  getVisiblePointCount(): number | null {
    return this._visiblePointCount;
  }

  // -----------------------------------------------------------------------
  // Point manipulation
  // -----------------------------------------------------------------------

  /**
   * Add points to this VMobject using 2D Point objects
   */
  addPoints(...points: Point[]): this {
    this._points3D.push(...points.map((p) => [p.x, p.y, 0]));
    this._geometryDirty = true;
    this._markDirty();
    return this;
  }

  /**
   * Set the points to form straight line segments between corner points.
   * Each pair of consecutive corners becomes a cubic Bezier with linear handles.
   * Matches Manim's set_points_as_corners.
   * @param corners Array of [x, y, z] corner points
   * @returns this for chaining
   */
  setPointsAsCorners(corners: number[][]): this {
    if (corners.length < 2) {
      if (corners.length === 1) {
        return this.setPoints([corners[0]]);
      }
      return this.setPoints([]);
    }

    const points: number[][] = [];
    for (let i = 0; i < corners.length - 1; i++) {
      const p0 = corners[i];
      const p1 = corners[i + 1];
      if (i === 0) {
        points.push([p0[0], p0[1], p0[2] || 0]);
      }
      // handle1 = lerp(p0, p1, 1/3)
      points.push([
        p0[0] + (p1[0] - p0[0]) / 3,
        p0[1] + (p1[1] - p0[1]) / 3,
        (p0[2] || 0) + ((p1[2] || 0) - (p0[2] || 0)) / 3,
      ]);
      // handle2 = lerp(p0, p1, 2/3)
      points.push([
        p0[0] + (2 * (p1[0] - p0[0])) / 3,
        p0[1] + (2 * (p1[1] - p0[1])) / 3,
        (p0[2] || 0) + (2 * ((p1[2] || 0) - (p0[2] || 0))) / 3,
      ]);
      // anchor2 = p1
      points.push([p1[0], p1[1], p1[2] || 0]);
    }

    return this.setPoints(points);
  }

  /**
   * Add straight line segments from the last point to each corner.
   * Each corner creates a new cubic Bezier segment with linear handles.
   * Matches Manim's add_points_as_corners.
   * @param corners Array of [x, y, z] corner points to connect to
   * @returns this for chaining
   */
  addPointsAsCorners(corners: number[][]): this {
    for (const corner of corners) {
      if (this._points3D.length === 0) {
        this.setPointsAsCorners([corner]);
        continue;
      }

      const last = this._points3D[this._points3D.length - 1];
      const cz = corner[2] || 0;
      const lz = last[2] || 0;
      // handle1 = lerp(last, corner, 1/3)
      const h1 = [
        last[0] + (corner[0] - last[0]) / 3,
        last[1] + (corner[1] - last[1]) / 3,
        lz + (cz - lz) / 3,
      ];
      // handle2 = lerp(last, corner, 2/3)
      const h2 = [
        last[0] + (2 * (corner[0] - last[0])) / 3,
        last[1] + (2 * (corner[1] - last[1])) / 3,
        lz + (2 * (cz - lz)) / 3,
      ];
      const anchor = [corner[0], corner[1], cz];

      this._points3D.push(h1, h2, anchor);
      this._geometryDirty = true;
      this._markDirtyUpward();
    }
    return this;
  }

  /**
   * Clear all points
   */
  clearPoints(): this {
    this._points3D = [];
    this._visiblePointCount = null;
    this._geometryDirty = true;
    this._markDirty();
    return this;
  }

  /**
   * Flatten this VMobject into absolute coordinates: bake `worldMatrix` into
   * `_points3D` (translation, rotation and scale together — one matrix, no
   * inverse), reset the local transform to identity, and recurse into children.
   *
   * Seeds with this node's own matrix when called with no argument, so the bake
   * preserves world appearance whether or not there are ancestors.
   *
   * @post !this.isEmpty() => old.getPoints()[i] === this.getPoints()[i]  // world geometry preserved
   * @post this._computeOwnMatrix() === Identity
   */
  override normalizeTransform(worldMatrix: THREE.Matrix4 = this._ownMatrix()): this {
    if (this._points3D.length > 0) {
      const v = new THREE.Vector3();
      for (const p of this._points3D) {
        v.set(p[0], p[1], p[2]).applyMatrix4(worldMatrix);
        p[0] = v.x;
        p[1] = v.y;
        p[2] = v.z;
      }
      // Points were mutated in place; flag the Three.js geometry for rebuild so
      // bounds/center (read from the BufferGeometry) don't go stale.
      this._geometryDirty = true;
    }
    this._flattenAsContainer(worldMatrix);
    this._markDirtyUpward();
    return this;
  }

  // -----------------------------------------------------------------------
  // Transform subpath metadata
  // -----------------------------------------------------------------------

  /**
   * Set base subpath-length metadata for this VMobject.
   * Represents intrinsic topology (e.g. outer contour + holes from SVG parsing).
   */
  setBaseSubpathLengths(lengths: number[] | undefined): void {
    this._baseSubpathLengths = lengths ? [...lengths] : undefined;
    this._markDirtyUpward();
  }

  /**
   * Get base subpath lengths (intrinsic topology metadata).
   * Subclasses may override this to compute dynamic metadata.
   */
  getSubpathLengths(): number[] | undefined {
    return this._baseSubpathLengths ? [...this._baseSubpathLengths] : undefined;
  }

  /**
   * Set transform-time subpath lengths override.
   * Used by Transform animations to preserve compound-path structure.
   * @param lengths - Array of subpath lengths, or undefined to clear
   */
  setTransformSubpathLengths(lengths: number[] | undefined): void {
    if (lengths === undefined) {
      this._transformSubpathLengths = undefined;
    } else {
      this._transformSubpathLengths = [...lengths];
    }
    this._markDirtyUpward();
  }

  /**
   * Get effective subpath lengths for rendering.
   * Returns transform override if present, else base/subclass metadata.
   */
  getEffectiveSubpathLengths(): number[] | undefined {
    if (this._transformSubpathLengths !== undefined) {
      return [...this._transformSubpathLengths];
    }
    return this.getSubpathLengths?.();
  }

  /**
   * Get orientation sign for each subpath: +1 (CCW) or -1 (CW).
   * Returns undefined when subpath metadata is missing or inconsistent.
   */
  getSubpathOrientationSigns(lengths?: number[]): Array<1 | -1> | undefined {
    const effective = lengths ?? this.getEffectiveSubpathLengths();
    if (!effective || effective.length === 0) return undefined;

    const signs: Array<1 | -1> = [];
    let offset = 0;
    for (const len of effective) {
      if (len <= 0 || offset + len > this._points3D.length) {
        throw new Error(
          `getSubpathOrientationSigns: invalid subpath at offset ${offset} len ${len} (points=${this._points3D.length})`,
        );
      }
      const chunk = this._points3D.slice(offset, offset + len);
      const area = signedArea2DFromStride(chunk, 3);
      signs.push(area < 0 ? -1 : 1);
      offset += len;
    }

    if (offset !== this._points3D.length) {
      throw new Error(
        `getSubpathOrientationSigns: lengths sum (${offset}) != points length (${this._points3D.length})`,
      );
    }
    return signs;
  }

  /**
   * Get orientation sign for a specific subpath index: +1 (CCW) or -1 (CW).
   */
  getSubpathOrientationSign(index: number): 1 | -1 {
    const signs = this.getSubpathOrientationSigns();
    if (!signs || index < 0 || index >= signs.length) {
      throw new RangeError(
        `getSubpathOrientationSign: index ${index} out of range [0, ${signs?.length ?? 0})`,
      );
    }
    return signs[index];
  }

  // -----------------------------------------------------------------------
  // Interpolation and alignment
  // -----------------------------------------------------------------------

  /**
   * Interpolate this VMobject towards a target VMobject
   * @param target - The target VMobject to interpolate towards
   * @param alpha - Progress from 0 (this) to 1 (target)
   * @returns this for chaining
   */
  interpolate(target: VMobject, alpha: number): this {
    // Ensure we have the same number of points
    if (this._points3D.length !== target._points3D.length) {
      this.alignPoints(target);
    }

    // Interpolate each 3D point
    for (let i = 0; i < this._points3D.length; i++) {
      this._points3D[i] = lerpPoint3D(this._points3D[i], target._points3D[i], alpha);
    }

    // Interpolate style properties
    this._opacity = lerp(this._opacity, target._opacity, alpha);
    this.fillOpacity = lerp(this.fillOpacity, target.fillOpacity, alpha);
    this.strokeWidth = lerp(this.strokeWidth, target.strokeWidth, alpha);

    // Also interpolate _style for backward compatibility
    if (this._style.fillOpacity !== undefined && target._style.fillOpacity !== undefined) {
      this._style.fillOpacity = lerp(this._style.fillOpacity, target._style.fillOpacity, alpha);
    }
    if (this._style.strokeOpacity !== undefined && target._style.strokeOpacity !== undefined) {
      this._style.strokeOpacity = lerp(
        this._style.strokeOpacity,
        target._style.strokeOpacity,
        alpha,
      );
    }
    if (this._style.strokeWidth !== undefined && target._style.strokeWidth !== undefined) {
      this._style.strokeWidth = lerp(this._style.strokeWidth, target._style.strokeWidth, alpha);
    }

    // Interpolate position
    this.position.lerp(target.position, alpha);

    // Interpolate scale
    this.scaleVector.lerp(target.scaleVector, alpha);

    this._geometryDirty = true;
    this._markDirty();
    return this;
  }

  /**
   * Align points between this VMobject and a target so they have the same
   * count, consistent winding, and optimal rotation for smooth morphing.
   * @param target - The target VMobject to align with
   */
  alignPoints(target: VMobject): void {
    const thisCount = this._points3D.length;
    const targetCount = target._points3D.length;

    const maxCount = Math.max(thisCount, targetCount);

    // Interpolate points to match counts
    if (thisCount < maxCount) {
      this._points3D = this._interpolatePointList3D(this._points3D, maxCount);
    }
    if (targetCount < maxCount) {
      target._points3D = this._interpolatePointList3D(target._points3D, maxCount);
    }

    // Need at least 4 points (one cubic bezier segment) to optimize
    if (this._points3D.length < 4) return;

    // Ensure consistent winding direction between source and target.
    // Opposite winding causes collapsed/twisted intermediate shapes.
    const srcWinding = signedArea2DFromStride(this._points3D, 3);
    const tgtWinding = signedArea2DFromStride(target._points3D, 3);
    if (srcWinding * tgtWinding < 0) {
      // Opposite winding — reverse target points (preserve bezier structure)
      target._points3D = VMobject._reverseBezierPath(target._points3D);
    }

    // Find the cyclic rotation of target points that minimises total
    // squared distance to the source, so corresponding points are
    // geometrically close and the morph looks smooth.
    target._points3D = VMobject._bestRotation(this._points3D, target._points3D);
  }

  /**
   * Reverse a cubic-bezier point path while preserving bezier structure.
   * For cubic segments [A0, H1, H2, A1, H3, H4, A2, ...],
   * reversing means the path goes in the opposite direction.
   */
  private static _reverseBezierPath(pts: number[][]): number[][] {
    if (pts.length < 2) return pts.map((p) => [...p]);
    // Simply reverse the entire array — this reverses the path direction
    // and swaps control handle order within each segment, which is correct
    // for cubic beziers.
    return [...pts].reverse().map((p) => [...p]);
  }

  /**
   * Find the cyclic rotation of `target` anchor points that minimises
   * total squared distance to `source`, then apply that rotation.
   * Only rotates by multiples of the bezier stride (3) to preserve
   * the cubic bezier segment structure.
   */
  private static _bestRotation(source: number[][], target: number[][]): number[][] {
    const n = target.length;
    if (n < 4) return target;

    // Detect closed path: first point ≈ last point
    const first = target[0];
    const last = target[n - 1];
    const closed = Math.abs(first[0] - last[0]) < 1e-6 && Math.abs(first[1] - last[1]) < 1e-6;

    // For closed paths, the "open" portion is points 0..n-2 (length = n-1).
    // We rotate within this open portion, then duplicate the first point.
    const openLen = closed ? n - 1 : n;

    const stride = 3; // cubic bezier: each segment = 3 new points
    const numRotations = Math.floor(openLen / stride);
    if (numRotations <= 1) return target;

    let bestDist = Infinity;
    let bestShift = 0;

    for (let r = 0; r < numRotations; r++) {
      const shift = r * stride;
      let dist = 0;
      for (let i = 0; i < openLen; i++) {
        const si = source[i];
        const ti = target[(i + shift) % openLen];
        const dx = si[0] - ti[0];
        const dy = si[1] - ti[1];
        dist += dx * dx + dy * dy;
      }
      if (dist < bestDist) {
        bestDist = dist;
        bestShift = shift;
      }
    }

    if (bestShift === 0) return target;

    // Apply the rotation within the open portion
    const rotated: number[][] = [];
    for (let i = 0; i < openLen; i++) {
      const srcIdx = (i + bestShift) % openLen;
      rotated.push([...target[srcIdx]]);
    }
    // Re-close the path
    if (closed) {
      rotated.push([...rotated[0]]);
    }
    return rotated;
  }

  /**
   * Interpolate a 3D point list to have a specific number of points.
   *
   * Delegates to the bezier-aware `resamplePointList3D` so that valid cubic
   * Bezier chains are densified by de Casteljau subdivision rather than
   * piecewise-linear interpolation. Linear lerp on cubic control points
   * silently produces invalid handles (handle = midpoint of two adjacent
   * controls), which renders as flat polygonal segments mid-`Transform`.
   */
  protected _interpolatePointList3D(points: number[][], targetCount: number): number[][] {
    if (points.length === 0) {
      return Array(targetCount)
        .fill(null)
        .map(() => [0, 0, 0]);
    }
    return resamplePointList3D(points, targetCount);
  }

  protected _copyBaseAttributesInto(
    clone: VMobject,
    options?: { copyChildren?: boolean; copyPosition?: boolean },
  ): void {
    super._copyBaseAttributesInto(clone, options);
    clone._points3D = this._points3D.map((p) => [...p]);
    clone._visiblePointCount = this._visiblePointCount;
    if (this._transformSubpathLengths !== undefined) {
      clone._transformSubpathLengths = [...this._transformSubpathLengths];
    }
    clone._geometryDirty = true;
  }

  // -----------------------------------------------------------------------
  // Copy / clone
  // -----------------------------------------------------------------------

  /**
   * Copy this VMobject, preserving point data state after morphs/transforms.
   *
   * For subclasses (Circle, Square, etc.): constructors regenerate points from
   * parameters (radius, sideLength, ...). After a Transform animation has morphed
   * the data, the regenerated points no longer match the visual state. Subclasses
   * must override copy(), build a new instance with their constructor params, call
   * _copyBaseAttributesInto, and then overwrite _points3D with the current state.
   *
   * For direct VMobject (rare): just builds and copies.
   */
  override copy(): VMobject {
    const clone = new VMobject();
    this._copyBaseAttributesInto(clone);
    // Overwrite points so they reflect current (possibly morphed) state,
    // not whatever the constructor regenerated.
    return clone;
  }

  // -----------------------------------------------------------------------
  // Geometry queries
  // -----------------------------------------------------------------------

  /**
   * Get the unit vector from the first to the last point of this VMobject,
   * accounting for the object's current rotation transform.
   */
  getUnitVector(): Vector3Tuple {
    const points = this._points3D;
    if (points.length < 2) {
      return [1, 0, 0];
    }
    const start = points[0];
    const end = points[points.length - 1];
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const dz = end[2] - start[2];
    const mag = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (mag < 1e-10) return [1, 0, 0];
    // Apply the object's rotation to the local direction vector
    const vec = new THREE.Vector3(dx / mag, dy / mag, dz / mag);
    const quat = new THREE.Quaternion().setFromEuler(this.rotation);
    vec.applyQuaternion(quat);
    return [vec.x, vec.y, vec.z];
  }

  /**
   * World-space bounding box computed from bezier control points.
   *
   * Overrides Mobject.getBounds() to avoid Box3.setFromObject(), which does
   * not work for Line2 geometries. See PointBounds.ts for the full explanation.
   *
   * @pre !this.isEmpty()
   * @post result.min <= result.max component-wise
   */
  override getBounds(): {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  } {
    const box = new THREE.Box3();
    const tempBox = new THREE.Box3();
    const tempMin = new THREE.Vector3();
    const tempMax = new THREE.Vector3();
    for (const p of this.getAllPoints()) box.expandByPoint(tempMin.set(p[0], p[1], p[2]));
    // Non-VMobject children use Three.js path.
    for (const child of this.children) {
      if (!(child instanceof VMobject)) {
        const b = child.getBounds();
        box.union(
          tempBox.set(
            tempMin.set(b.min.x, b.min.y, b.min.z),
            tempMax.set(b.max.x, b.max.y, b.max.z),
          ),
        );
      }
    }
    if (box.isEmpty()) {
      throw new Error(`VMobject.getBounds(): ${this.constructor.name} (${this.id}) has no points.`);
    }
    return {
      min: { x: box.min.x, y: box.min.y, z: box.min.z },
      max: { x: box.max.x, y: box.max.y, z: box.max.z },
    };
  }

  /**
   * World-space bounding-box center derived from getAllPoints().
   *
   * Matches Python manim: the center is always the midpoint of the axis-aligned
   * bounding box of every point in the family — no per-shape construction-point
   * overrides. For the vertex centroid (which differs for asymmetric shapes like
   * sectors), use {@link getCenterOfMass}.
   */
  override getCenter(): Vector3Tuple {
    const worldPoints = this.getAllPoints();
    const bounds = computePointBounds(worldPoints);
    if (!bounds) {
      return [this.position.x, this.position.y, this.position.z];
    }

    return [
      (bounds.min.x + bounds.max.x) / 2,
      (bounds.min.y + bounds.max.y) / 2,
      (bounds.min.z + bounds.max.z) / 2,
    ];
  }

  /**
   * Get center of mass in world coordinates by averaging all world-space points.
   *
   * Unlike {@link getCenter} (which uses bbox midpoint), this is the true
   * centroid — equal to getCenter() only when points are symmetrically distributed.
   */
  getCenterOfMass(): Vector3Tuple {
    const pts = this.getAllPoints();
    if (pts.length === 0) {
      throw new Error('getCenterOfMass: VMobject has 0 points');
    }
    let sx = 0,
      sy = 0,
      sz = 0;
    for (const p of pts) {
      sx += p[0];
      sy += p[1];
      sz += p[2];
    }
    const n = pts.length;
    return [sx / n, sy / n, sz / n];
  }

  moveCenterOfMassTo(target: Vector3Tuple): this {
    this.shift([
      target[0] - this.getCenterOfMass()[0],
      target[1] - this.getCenterOfMass()[1],
      target[2] - this.getCenterOfMass()[2],
    ]);
    return this;
  }

  /**
   * Compute local bounding-box center across this VMobject and all descendants
   * that expose point data.
   */
  private _familyPointsCenter(): Vector3Tuple | null {
    let minX = Infinity,
      maxX = -Infinity;
    let minY = Infinity,
      maxY = -Infinity;
    let minZ = Infinity,
      maxZ = -Infinity;
    let hasPoints = false;

    for (const m of this.getFamily()) {
      if (!isVMobject(m)) continue;
      for (const p of m.getLocalPoints()) {
        hasPoints = true;
        if (p[0] < minX) minX = p[0];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] < minY) minY = p[1];
        if (p[1] > maxY) maxY = p[1];
        if (p[2] < minZ) minZ = p[2];
        if (p[2] > maxZ) maxZ = p[2];
      }
    }

    if (!hasPoints) return null;
    return [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
  }

  /**
   * Centers local geometry around the origin and updates position accordingly.
   *
   * This scans all descendant VMobject points (not only this._points3D), so
   * container-style VMobjects (e.g. MathTex/SVGMobject/CurvesAsSubmobjects)
   * are also centered correctly.
   *
   * @returns this for chaining
   */
  centerPointsAroundPosition(): this {
    const center = this._familyPointsCenter();
    if (!center) {
      return this;
    }

    // Translate descendant geometry by -center in local coordinates.
    for (const m of this.getFamily()) {
      if (m instanceof VMobject) {
        for (const p of m._points3D) {
          p[0] -= center[0];
          p[1] -= center[1];
          p[2] -= center[2];
        }
        m._geometryDirty = true;
        m._markDirty();
      }
    }

    // Update root position to compensate so world-space appearance is unchanged.
    this.position.x += center[0];
    this.position.y += center[1];
    this.position.z += center[2];

    this._markDirtyUpward();

    return this;
  }

  // -----------------------------------------------------------------------
  // Disposal
  // -----------------------------------------------------------------------

  /**
   * Clean up Three.js resources
   */
  override dispose(): void {
    this._disposeRenderingResources();
    super.dispose();
  }
}

// Re-export curve utilities for backward compatibility
// Curve utilities (getNumCurves, getNthCurve, curvesAsSubmobjects, CurvesAsSubmobjects)
// are available from './VMobjectCurveUtils' - import directly to avoid circular dependency
