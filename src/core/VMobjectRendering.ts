/**
 * VMobject rendering logic: stroke (Line2, mesh, shader), fill, and geometry management.
 *
 * This module provides the VMobjectRendering base class which encapsulates
 * all Three.js rendering concerns (materials, geometry, stencil) for
 * vectorized mobjects. VMobject extends this class and adds point
 * manipulation, interpolation, and alignment on top.
 */

import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { Mobject } from './Mobject';
import { BezierRenderer } from '../rendering/BezierRenderer';
import type { Point } from './VMobjectCurves';
import {
  sampleBezierPath,
  buildEarcutFillGeometry,
  isClosedPath,
  pointsToShape,
  pointsToCurvePath,
} from './VMobjectGeometry';
import { buildMeshStrokeGeometry } from './VMobjectStrokeGeometry';

/**
 * Base class for VMobject that handles all Three.js rendering:
 * stroke materials, fill materials, geometry building, stencil management,
 * and Bezier path sampling.
 *
 * Subclasses must implement point-access methods used by the rendering
 * pipeline: getVisiblePoints(), getVisiblePoints3D(), etc.
 */
export abstract class VMobjectRendering extends Mobject {
  /** Three.js stroke material (Line2 LineMaterial for thick strokes) */
  protected _strokeMaterial: LineMaterial | null = null;

  /** Three.js fill material */
  protected _fillMaterial: THREE.MeshBasicMaterial | null = null;

  /** Whether geometry needs rebuild (separate from material dirty) */
  protected _geometryDirty: boolean = true;

  /** Tracks whether opacity was fully opaque last sync (for corner-wrap rebuild) */
  private _wasOpaque: boolean = true;

  /** Cached Line2 for in-place geometry updates (avoids dispose/recreate) */
  private _cachedLine2: Line2 | null = null;

  /** Cached Line2 array for multi-subpath stroke rendering */
  private _cachedLine2Array: Line2[] = [];

  /** Cached fill mesh for in-place geometry updates */
  private _cachedFillMesh: THREE.Mesh | null = null;

  /**
   * Per-instance stencil ref for preventing double-blending at Line2 joints
   * when the stroke is partially transparent. Each VMobject gets a unique
   * ref (mod 254, range 1-255) so different objects don't block each other.
   */
  private static _stencilCounter = 0;
  private _stencilRef: number = (VMobjectRendering._stencilCounter++ % 254) + 1;

  /** Renderer resolution for LineMaterial (set by Scene) */
  static _rendererWidth: number = 800;
  static _rendererHeight: number = 450;

  /** Camera frame width in world units (set by Scene, for stroke width conversion) */
  static _frameWidth: number = 14;

  /**
   * Per-instance renderer context (set by Scene when VMobject is added).
   * When non-null these override the class-level statics so that multiple
   * Scene instances do not corrupt each other's stroke-width calculations.
   */
  _sceneRendererWidth: number | null = null;
  _sceneRendererHeight: number | null = null;
  _sceneFrameWidth: number | null = null;

  /** Shorthand for `this.constructor` typed as the static side of the class. */
  private get _Cls(): typeof VMobjectRendering {
    return this.constructor as typeof VMobjectRendering;
  }

  /** Get effective renderer width (per-instance override or static fallback) */
  private _getRendererWidth(): number {
    return this._sceneRendererWidth ?? this._Cls._rendererWidth;
  }

  /** Get effective renderer height (per-instance override or static fallback) */
  private _getRendererHeight(): number {
    return this._sceneRendererHeight ?? this._Cls._rendererHeight;
  }

  /** Get effective frame width (per-instance override or static fallback) */
  private _getFrameWidth(): number {
    return this._sceneFrameWidth ?? this._Cls._frameWidth;
  }

  /** Instance-level linewidth computation using per-instance scene context */
  private _computeLinewidth(strokeWidth: number): number {
    return strokeWidth * 0.01 * (this._getRendererWidth() / this._getFrameWidth());
  }

  /**
   * Set per-instance scene context for multi-scene support.
   * Called by Scene when a VMobject is added or the scene is resized.
   */
  _setSceneContext(rendererWidth: number, rendererHeight: number, frameWidth: number): void {
    this._sceneRendererWidth = rendererWidth;
    this._sceneRendererHeight = rendererHeight;
    this._sceneFrameWidth = frameWidth;
  }

  /**
   * Convert Manim-compatible strokeWidth to LineMaterial linewidth in pixels.
   * Python Manim uses cairo_line_width_multiple=0.01, so:
   *   linewidth_px = strokeWidth * 0.01 * (rendererWidth / frameWidth)
   *
   * NOTE: This static method uses class-level statics. For multi-scene
   * correctness, internal code should use the instance method _computeLinewidth().
   */
  static _toLinewidth(this: typeof VMobjectRendering, strokeWidth: number): number {
    return strokeWidth * 0.01 * (this._rendererWidth / this._frameWidth);
  }

  /**
   * When true, VMobjects use GPU Bezier SDF shaders for stroke rendering
   * instead of the default Line2/LineMaterial approach.
   */
  static useShaderCurves: boolean = false;

  /** Shared BezierRenderer instance (lazy-initialized) */
  private static _sharedBezierRenderer: BezierRenderer | null = null;

  /** Per-instance: cached Bezier SDF stroke mesh */
  private _cachedBezierMesh: THREE.Mesh | null = null;

  /** Per-instance override for shader curves (null = use static default) */
  private _useShaderCurvesOverride: boolean | null = null;

  /**
   * When true, render stroke as a mesh ring with miter-joined corners instead
   * of Line2 for closed paths.
   */
  useStrokeMesh: boolean = false;

  /** Cached mesh-based stroke ring */
  private _cachedStrokeMesh: THREE.Mesh | null = null;

  /** Material for mesh-based stroke */
  private _strokeMeshMaterial: THREE.MeshBasicMaterial | null = null;

  /**
   * Get the shared BezierRenderer, creating it if needed.
   */
  private static _getBezierRenderer(cls: typeof VMobjectRendering): BezierRenderer {
    if (!VMobjectRendering._sharedBezierRenderer) {
      VMobjectRendering._sharedBezierRenderer = new BezierRenderer({
        resolution: [cls._rendererWidth, cls._rendererHeight],
        pixelRatio: typeof window !== 'undefined' ? Math.min(window.devicePixelRatio, 2) : 1,
      });
    }
    return VMobjectRendering._sharedBezierRenderer;
  }

  /** Check whether this instance should use shader-based Bezier curve rendering. */
  get shaderCurves(): boolean {
    return this._useShaderCurvesOverride ?? this._Cls.useShaderCurves;
  }

  /** Enable or disable shader-based Bezier rendering for this instance. */
  set shaderCurves(value: boolean | null) {
    this._useShaderCurvesOverride = value;
    this._geometryDirty = true;
    this._markDirty();
  }

  /** Mark geometry as needing rebuild on next render. */
  markGeometryDirty(): void {
    this._geometryDirty = true;
    this._markDirty();
  }

  /**
   * This VMobject's own stroke Line2 primitives (one per subpath), synced on
   * demand. Scoped strictly to this instance's rendering cache — never
   * includes descendants' primitives. Lets callers (e.g. Create's lagRatio
   * stagger) drive exactly one mobject's own segments without walking the
   * Three.js scene graph, which cannot distinguish "another family member"
   * from "another subpath of this same member".
   *
   * `_cachedLine2`/`_cachedLine2Array` stay private and mutable internally
   * (which cache is active is an implementation detail); this returns a
   * fresh array so callers cannot corrupt that internal state.
   */
  getOwnStrokeLines(): Line2[] {
    this.getThreeObject(); // ensure this node's own geometry is synced (cheap no-op if already clean)
    return this._cachedLine2 ? [this._cachedLine2] : [...this._cachedLine2Array];
  }

  /**
   * VMobject-level upward dirty propagation must also mark geometry dirty.
   * This keeps geometry invalidation centralized for point/curve mutations.
   */
  override _markDirtyUpward(): void {
    this._geometryDirty = true;
    super._markDirtyUpward();
  }

  // -----------------------------------------------------------------------
  // Abstract point-access methods required by the rendering pipeline.
  // -----------------------------------------------------------------------

  abstract getVisiblePoints(): Point[];
  abstract getVisiblePoints3D(): number[][];

  // -----------------------------------------------------------------------
  // Proxy methods for geometry functions (preserves protected access pattern)
  // -----------------------------------------------------------------------

  protected _pointsToShape(): THREE.Shape {
    return pointsToShape(this.getVisiblePoints());
  }

  protected _pointsToCurvePath(): THREE.CurvePath<THREE.Vector3> {
    return pointsToCurvePath(this.getVisiblePoints3D());
  }

  protected _buildEarcutFillGeometry(points3D: number[][]): THREE.BufferGeometry | null {
    const effectiveLengths = (
      this as unknown as { getEffectiveSubpathLengths?: () => number[] | undefined }
    ).getEffectiveSubpathLengths?.();
    const getSubpathLengths = effectiveLengths ? () => effectiveLengths : undefined;
    return buildEarcutFillGeometry(points3D, this.getVisiblePoints(), getSubpathLengths);
  }

  // -----------------------------------------------------------------------
  // Three.js object creation
  // -----------------------------------------------------------------------

  /**
   * Create the Three.js backing object for this VMobject.
   */
  protected _createThreeObject(): THREE.Object3D {
    const group = new THREE.Group();

    this._strokeMaterial = new LineMaterial({
      color: new THREE.Color(this.color).getHex(),
      linewidth: this._computeLinewidth(this.strokeWidth),
      opacity: this._opacity,
      transparent: this._opacity < 1,
      depthWrite: this._opacity >= 1,
      resolution: new THREE.Vector2(this._getRendererWidth(), this._getRendererHeight()),
      dashed: false,
    });

    this._fillMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(this._style.fillColor || this.color),
      transparent: true,
      depthWrite: false,
      opacity: this._opacity * this.fillOpacity,
      side: THREE.DoubleSide,
    });

    this._updateGeometry(group);

    return group;
  }

  /**
   * Update the geometry within the Three.js group.
   */
  protected _updateGeometry(group: THREE.Group): void {
    const points3D = this.getVisiblePoints3D();
    if (points3D.length < 2) {
      this._disposeGroupChildren(group);
      this._cachedLine2 = null;
      this._cachedLine2Array = [];
      this._cachedFillMesh = null;
      this._cachedBezierMesh = null;
      this._cachedStrokeMesh = null;
      return;
    }

    const useShader = this.shaderCurves;
    const useMeshStroke = !useShader && this.useStrokeMesh && isClosedPath(points3D);

    if (useShader) {
      this._updateBezierStroke(group, points3D);
      if (this._cachedLine2) {
        this._cachedLine2.geometry.dispose();
        group.remove(this._cachedLine2);
        this._cachedLine2 = null;
      }
      this._clearCachedLine2Array(group);
      this._removeMeshStroke(group);
    } else if (useMeshStroke) {
      const sampledPoints = sampleBezierPath(points3D, 16);
      this._updateMeshStroke(group, sampledPoints);
      if (this._cachedLine2) {
        this._cachedLine2.geometry.dispose();
        group.remove(this._cachedLine2);
        this._cachedLine2 = null;
      }
      this._clearCachedLine2Array(group);
      if (this._cachedBezierMesh) {
        this._cachedBezierMesh.geometry.dispose();
        group.remove(this._cachedBezierMesh);
        this._cachedBezierMesh = null;
      }
    } else {
      this._updateLine2Stroke(group, points3D);
      if (this._cachedBezierMesh) {
        this._cachedBezierMesh.geometry.dispose();
        group.remove(this._cachedBezierMesh);
        this._cachedBezierMesh = null;
      }
      this._removeMeshStroke(group);
    }

    // --- Fill mesh ---
    if (this.fillOpacity > 0 && points3D.length >= 4) {
      const fillGeom = this._buildEarcutFillGeometry(points3D);
      if (fillGeom) {
        if (this._cachedFillMesh) {
          this._cachedFillMesh.geometry.dispose();
          this._cachedFillMesh.geometry = fillGeom;
        } else {
          const fillMesh = new THREE.Mesh(fillGeom, this._fillMaterial!);
          fillMesh.position.z = -0.001;
          fillMesh.frustumCulled = false;
          group.add(fillMesh);
          this._cachedFillMesh = fillMesh;
        }
      }
    } else if (this._cachedFillMesh) {
      this._cachedFillMesh.geometry.dispose();
      group.remove(this._cachedFillMesh);
      this._cachedFillMesh = null;
    }
  }

  // -----------------------------------------------------------------------
  // Line2 stroke
  // -----------------------------------------------------------------------

  private _updateLine2Stroke(group: THREE.Group, points3D: number[][]): void {
    const subpathLengths = (
      this as unknown as { getEffectiveSubpathLengths?: () => number[] | undefined }
    ).getEffectiveSubpathLengths?.();

    if (subpathLengths && subpathLengths.length > 1) {
      this._updateLine2StrokeMulti(group, points3D, subpathLengths);
      return;
    }

    this._clearCachedLine2Array(group);
    const sampledPoints = sampleBezierPath(points3D, 16);

    if (this.strokeWidth > 0 && sampledPoints.length >= 2) {
      const positions = this._buildLine2Positions(sampledPoints);

      if (this._cachedLine2) {
        this._cachedLine2.geometry.dispose();
        const geometry = new LineGeometry();
        geometry.setPositions(positions);
        this._cachedLine2.geometry = geometry;
        this._cachedLine2.computeLineDistances();
      } else {
        const geometry = new LineGeometry();
        geometry.setPositions(positions);
        const line = new Line2(geometry, this._strokeMaterial!);
        line.computeLineDistances();
        line.frustumCulled = false;
        group.add(line);
        this._cachedLine2 = line;
      }
    } else if (this._cachedLine2) {
      this._cachedLine2.geometry.dispose();
      group.remove(this._cachedLine2);
      this._cachedLine2 = null;
    }
  }

  private _updateLine2StrokeMulti(
    group: THREE.Group,
    points3D: number[][],
    subpathLengths: number[],
  ): void {
    if (this._cachedLine2) {
      this._cachedLine2.geometry.dispose();
      group.remove(this._cachedLine2);
      this._cachedLine2 = null;
    }

    const subpathPointArrays: number[][][] = [];
    let offset = 0;
    for (const len of subpathLengths) {
      subpathPointArrays.push(points3D.slice(offset, offset + len));
      offset += len;
    }

    while (this._cachedLine2Array.length > subpathPointArrays.length) {
      const old = this._cachedLine2Array.pop()!;
      old.geometry.dispose();
      group.remove(old);
    }

    for (let i = 0; i < subpathPointArrays.length; i++) {
      const subPoints = subpathPointArrays[i];
      const sampledPoints = sampleBezierPath(subPoints, 16);

      if (this.strokeWidth > 0 && sampledPoints.length >= 2) {
        const positions = this._buildLine2Positions(sampledPoints);

        if (this._cachedLine2Array[i]) {
          this._cachedLine2Array[i].geometry.dispose();
          const geometry = new LineGeometry();
          geometry.setPositions(positions);
          this._cachedLine2Array[i].geometry = geometry;
          this._cachedLine2Array[i].computeLineDistances();
        } else {
          const geometry = new LineGeometry();
          geometry.setPositions(positions);
          const line = new Line2(geometry, this._strokeMaterial!);
          line.computeLineDistances();
          line.frustumCulled = false;
          group.add(line);
          this._cachedLine2Array[i] = line;
        }
      }
    }
  }

  /**
   * Build Line2 position array from sampled points, with optional
   * corner-wrap for closed paths at full opacity.
   */
  private _buildLine2Positions(sampledPoints: number[][]): number[] {
    const positions: number[] = [];
    for (const pt of sampledPoints) {
      positions.push(pt[0], pt[1], pt[2]);
    }

    // Corner-wrap for closed paths at full opacity
    if (this._opacity >= 1 && sampledPoints.length >= 3) {
      const first = sampledPoints[0];
      const last = sampledPoints[sampledPoints.length - 1];
      const dx = first[0] - last[0],
        dy = first[1] - last[1],
        dz = first[2] - last[2];
      if (dx * dx + dy * dy + dz * dz < 1e-6) {
        const wrap = Math.min(2, sampledPoints.length - 1);
        for (let i = 1; i <= wrap; i++) {
          const pt = sampledPoints[i];
          positions.push(pt[0], pt[1], pt[2]);
        }
      }
    }

    return positions;
  }

  // -----------------------------------------------------------------------
  // Mesh stroke
  // -----------------------------------------------------------------------

  private _updateMeshStroke(group: THREE.Group, sampledPoints: number[][]): void {
    const result = buildMeshStrokeGeometry(group, sampledPoints, this.strokeWidth, this._opacity);

    if (!result) {
      this._removeMeshStroke(group);
      return;
    }

    if (this._cachedStrokeMesh) {
      this._cachedStrokeMesh.geometry.dispose();
      this._cachedStrokeMesh.geometry = result.geometry;
      if (this._strokeMeshMaterial) {
        this._strokeMeshMaterial.color.set(this.color);
        this._strokeMeshMaterial.opacity = this._opacity;
        this._strokeMeshMaterial.transparent = this._opacity < 1;
        this._strokeMeshMaterial.depthWrite = this._opacity >= 1;
      }
    } else {
      this._strokeMeshMaterial =
        this._strokeMeshMaterial ||
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(this.color),
          side: THREE.DoubleSide,
          depthTest: false,
          transparent: this._opacity < 1,
          depthWrite: this._opacity >= 1,
          opacity: this._opacity,
        });
      this._strokeMeshMaterial.color.set(this.color);
      this._strokeMeshMaterial.opacity = this._opacity;
      this._strokeMeshMaterial.transparent = this._opacity < 1;
      this._strokeMeshMaterial.depthWrite = this._opacity >= 1;
      this._cachedStrokeMesh = new THREE.Mesh(result.geometry, this._strokeMeshMaterial);
      this._cachedStrokeMesh.frustumCulled = false;
      group.add(this._cachedStrokeMesh);
    }
  }

  private _removeMeshStroke(group: THREE.Group): void {
    if (this._cachedStrokeMesh) {
      this._cachedStrokeMesh.geometry.dispose();
      group.remove(this._cachedStrokeMesh);
      this._cachedStrokeMesh = null;
    }
  }

  private _clearCachedLine2Array(group: THREE.Group): void {
    for (const line of this._cachedLine2Array) {
      line.geometry.dispose();
      group.remove(line);
    }
    this._cachedLine2Array = [];
  }

  // -----------------------------------------------------------------------
  // Bezier SDF shader stroke
  // -----------------------------------------------------------------------

  private _updateBezierStroke(group: THREE.Group, points3D: number[][]): void {
    if (this.strokeWidth <= 0 || points3D.length < 4) {
      if (this._cachedBezierMesh) {
        this._cachedBezierMesh.geometry.dispose();
        group.remove(this._cachedBezierMesh);
        this._cachedBezierMesh = null;
      }
      return;
    }

    const renderer = VMobjectRendering._getBezierRenderer(this._Cls);
    const segments = BezierRenderer.extractSegments(
      points3D,
      this.strokeWidth,
      undefined,
      this.color,
      this._opacity,
    );

    if (segments.length === 0) {
      if (this._cachedBezierMesh) {
        this._cachedBezierMesh.geometry.dispose();
        group.remove(this._cachedBezierMesh);
        this._cachedBezierMesh = null;
      }
      return;
    }

    if (this._cachedBezierMesh) {
      const updated = renderer.updateMeshFromSegments(this._cachedBezierMesh, segments);
      if (updated !== this._cachedBezierMesh) {
        group.remove(this._cachedBezierMesh);
        group.add(updated);
        this._cachedBezierMesh = updated;
      }
    } else {
      this._cachedBezierMesh = renderer.buildMeshFromSegments(segments);
      group.add(this._cachedBezierMesh);
    }
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private _disposeGroupChildren(group: THREE.Group): void {
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof Line2) {
        (child as THREE.Mesh | THREE.Line | Line2).geometry?.dispose();
      }
    }
  }

  // -----------------------------------------------------------------------
  // Material sync
  // -----------------------------------------------------------------------

  protected override _syncMaterialToThree(): void {
    if (this._strokeMaterial) {
      this._strokeMaterial.color.set(this.color);
      this._strokeMaterial.opacity = this._opacity;
      this._strokeMaterial.transparent = this._opacity < 1;
      this._strokeMaterial.depthWrite = this._opacity >= 1;
      this._strokeMaterial.linewidth = this._computeLinewidth(this.strokeWidth);
      this._strokeMaterial.resolution.set(this._getRendererWidth(), this._getRendererHeight());

      if (this._opacity < 1) {
        this._strokeMaterial.stencilWrite = true;
        this._strokeMaterial.stencilFunc = THREE.NotEqualStencilFunc;
        this._strokeMaterial.stencilRef = this._stencilRef;
        this._strokeMaterial.stencilFuncMask = 0xff;
        this._strokeMaterial.stencilFail = THREE.KeepStencilOp;
        this._strokeMaterial.stencilZFail = THREE.KeepStencilOp;
        this._strokeMaterial.stencilZPass = THREE.ReplaceStencilOp;
      } else {
        this._strokeMaterial.stencilWrite = false;
      }
    }

    if (this._fillMaterial) {
      this._fillMaterial.color.set(this._style.fillColor || this.color);
      this._fillMaterial.opacity = this._opacity * this.fillOpacity;
    }

    if (this._strokeMeshMaterial) {
      this._strokeMeshMaterial.color.set(this.color);
      this._strokeMeshMaterial.opacity = this._opacity;
      this._strokeMeshMaterial.transparent = this._opacity < 1;
      this._strokeMeshMaterial.depthWrite = this._opacity >= 1;
    }

    if (VMobjectRendering._sharedBezierRenderer) {
      VMobjectRendering._sharedBezierRenderer.updateResolution(
        this._getRendererWidth(),
        this._getRendererHeight(),
        typeof window !== 'undefined' ? Math.min(window.devicePixelRatio, 2) : 1,
      );
    }

    const isOpaque = this._opacity >= 1;
    if (isOpaque !== this._wasOpaque) {
      this._geometryDirty = true;
      this._wasOpaque = isOpaque;
    }

    if (this._geometryDirty && this._threeObject instanceof THREE.Group) {
      this._updateGeometry(this._threeObject);
      this._geometryDirty = false;
    }
  }

  // -----------------------------------------------------------------------
  // Disposal
  // -----------------------------------------------------------------------

  protected _disposeRenderingResources(): void {
    this._strokeMaterial?.dispose();
    this._fillMaterial?.dispose();
    if (this._cachedLine2) {
      this._cachedLine2.geometry.dispose();
      this._cachedLine2 = null;
    }
    for (const line of this._cachedLine2Array) {
      line.geometry.dispose();
    }
    this._cachedLine2Array = [];
    this._cachedFillMesh = null;
    if (this._cachedBezierMesh) {
      this._cachedBezierMesh.geometry.dispose();
      this._cachedBezierMesh = null;
    }
    if (this._cachedStrokeMesh) {
      this._cachedStrokeMesh.geometry.dispose();
      this._cachedStrokeMesh = null;
    }
    this._strokeMeshMaterial?.dispose();
    this._strokeMeshMaterial = null;
  }
}
