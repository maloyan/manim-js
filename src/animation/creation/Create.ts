/**
 * Create animation - draws the mobject stroke progressively.
 * For VMobjects, this uses dashed lines to progressively reveal the stroke path,
 * similar to how Manim's Create animation works.
 */

import * as THREE from 'three';
import { Mobject } from '../../core/Mobject';
import { Group } from '../../core/Group';
import { VMobject } from '../../core/VMobject';
import { VGroup } from '../../core/VGroup';
import { Animation, AnimationOptions } from '../Animation';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { TextGlyphGroup } from '../../mobjects/text/TextGlyphGroup';
import type { GlyphVMobject } from '../../mobjects/text/GlyphVMobject';

/**
 * Interface for mobjects that support glyph-stroke animation (e.g. Text).
 */
interface GlyphStrokeMobject {
  getGlyphGroup(): TextGlyphGroup | null;
  getTextureMesh(): THREE.Mesh | null;
}

/**
 * Interface for mobjects that support left-to-right reveal (e.g. MathTex).
 */
interface RevealProgressMobject {
  setRevealProgress(alpha: number): void;
}

/**
 * Interface for mobjects that support getText/setText (e.g. Text).
 */
interface TextAccessMobject {
  getText(): string;
  setText(text: string): void;
}

/**
 * Interface for glyph mobjects that may have a skeleton path.
 */
interface SkeletonPathMobject {
  getSkeletonPath(): number[][] | null;
}

/**
 * Extract the total line distance from a Line2's geometry after computeLineDistances().
 * The instanceDistanceEnd attribute is an InterleavedBufferAttribute whose backing
 * data lives in `.data.array`, or a plain BufferAttribute with `.array`.
 */
export function getLine2TotalLength(child: Line2): number {
  const geom = child.geometry;
  const distEnd = geom.getAttribute('instanceDistanceEnd') as
    | THREE.InterleavedBufferAttribute
    | THREE.BufferAttribute
    | null;
  if (distEnd && distEnd.count > 0) {
    const arr = 'data' in distEnd && distEnd.data ? distEnd.data.array : distEnd.array;
    return (arr[arr.length - 1] as number) || 1;
  }
  return 1;
}

/**
 * Reveal (or erase) a Line2's dashed stroke up to `visibleLength` out of
 * `totalLen`. When nothing is revealed yet (or nothing remains), the line is
 * hidden outright instead of being left at `dashSize=0`.
 *
 * Manim CE's partial-stroke reveal (pointwise_become_partial) has no
 * unrevealed-tip artifact because the undrawn portion has no geometry at
 * all. Three.js's LineMaterial dashed-line discard test degenerates at
 * `dashSize=0` (see its own `// todo - FIX` comment at
 * `three/examples/jsm/lines/LineMaterial.js`, in the fragment shader's
 * `mod(vLineDistance + dashOffset, dashSize + gapSize) > dashSize` check) and
 * leaves a stray fragment visible at the line's start anchor -- normally a
 * single easy-to-miss frame on a solid shape, but glaring on something like
 * DashedLine where a dozen independent Line2 dashes sit at `dashSize=0`
 * simultaneously for most of the animation. Toggling `visible` sidesteps the
 * shader edge case entirely, matching Manim CE's "doesn't exist yet"
 * semantics.
 */
export function setLine2RevealLength(line: Line2, visibleLength: number, totalLen: number): void {
  if (visibleLength <= 1e-9) {
    line.visible = false;
    return;
  }
  line.visible = true;
  const material = line.material as LineMaterial;
  material.dashSize = visibleLength;
  material.gapSize = Math.max(0.0001, totalLen - visibleLength + 0.0001);
  material.needsUpdate = true;
}

/**
 * Check whether a mobject's Three.js subtree contains at least one Line2 child.
 * Used by Create-family animations to decide between dash-based reveal and opacity fallback.
 */
export function hasLine2Children(mobject: Mobject): boolean {
  let found = false;
  mobject.getThreeObject().traverse((child) => {
    if (child instanceof Line2) found = true;
  });
  return found;
}

export interface CreateOptions extends AnimationOptions {
  /** Stagger ratio between submobjects (0 = simultaneous, 1 = fully sequential). Default: 1 (matches Manim CE/3b1b) */
  lagRatio?: number;
}

export class Create extends Animation {
  /** Whether to use dash-based reveal (needs Line2 children) */
  private _useDashReveal: boolean = false;
  /** Whether the mobject has fill that needs to be animated */
  private _hasFill: boolean = false;
  /** Original fill opacity to restore */
  private _originalFillOpacity: number = 0;
  /** Lag ratio for staggered submobject animation */
  private _lagRatio: number = 0;
  /**
   * Stagger unit: family members with points (Manim CE's
   * family_members_with_points), NOT raw Line2 render primitives. A member
   * with several internal subpaths stays one entry here.
   */
  private _family: VMobject[] = [];
  /** Each family member's own Line2 segments (index-aligned with _family). */
  private _memberLines: Line2[][] = [];
  /** Each family member's per-segment total lengths (index-aligned with _memberLines). */
  private _memberLineLengths: number[][] = [];
  /** Saved per-descendant opacities for proportional scaling (opacity fallback path) */
  private _savedOpacities: Array<[Mobject, number]> = [];

  constructor(mobject: Mobject, options: CreateOptions = {}) {
    // Manim default for Create is 2 seconds
    super(mobject, { duration: options.duration ?? 2, ...options });
    // Manim CE / 3b1b default: lag_ratio=1.0 — submobjects draw sequentially,
    // each completing before the next starts (#544).
    this._lagRatio = options.lagRatio ?? 1;
  }

  /**
   * Set up the animation - configure dashed lines for progressive reveal.
   * For filled VMobjects (like Polygon with fillOpacity > 0), this behaves
   * like Manim's DrawBorderThenFill: first half draws the border, second
   * half fades in the fill.
   */
  override begin(): void {
    super.begin();

    this._useDashReveal = this.mobject instanceof VMobject && hasLine2Children(this.mobject);

    if (this._useDashReveal) {
      const vmob = this.mobject as VMobject;

      // Check if this VMobject has fill
      this._originalFillOpacity = vmob.fillOpacity;
      this._hasFill = this._originalFillOpacity > 0;

      // Hide fill initially so it can fade in during second half
      if (this._hasFill) {
        vmob.setFillOpacity(0);
      }

      // Stagger unit = family members with points (Manim CE semantics), not
      // raw Line2 primitives — a member with multiple subpaths must not be
      // split into multiple stagger units. Ensure the whole subtree is
      // synced first so every member's rendering cache is up to date.
      this.mobject.getThreeObject();
      this._family = vmob.familyMembersWithPoints();
      this._memberLines = [];
      this._memberLineLengths = [];

      for (const member of this._family) {
        const lines = member.getOwnStrokeLines();
        const lengths: number[] = [];
        for (const line of lines) {
          const material = line.material as LineMaterial;
          material.dashed = true;
          material.dashScale = 1;

          line.computeLineDistances();
          const totalLen = getLine2TotalLength(line);
          lengths.push(totalLen);

          // Start with nothing visible
          setLine2RevealLength(line, 0, totalLen);
        }
        this._memberLines.push(lines);
        this._memberLineLengths.push(lengths);
      }
    } else {
      // Non-line mobject (Text, etc.): use opacity
      // Save per-descendant opacities so children with different opacities
      // (e.g. NumberPlane background lines with opacity 0) are preserved
      this._savedOpacities = [];
      this._collectOpacities(this.mobject);
      this.mobject.setStrokeOpacity(0);
    }
  }

  /**
   * Recursively collect original opacities of a mobject and all descendants.
   */
  private _collectOpacities(mob: Mobject): void {
    this._savedOpacities.push([mob, mob.opacity]);
    // VGroup is a VMobject (not a Group), but its setStrokeOpacity also
    // propagates to children — so children must be saved/restored too,
    // otherwise begin()'s setStrokeOpacity(0) zeroes them permanently.
    if (mob instanceof Group || mob instanceof VGroup) {
      for (const child of mob.children) {
        this._collectOpacities(child);
      }
    }
  }

  /**
   * Apply proportionally scaled opacities to all saved descendants.
   * Uses Mobject.prototype.setStrokeOpacity to avoid Group propagation.
   */
  private _applyScaledOpacities(factor: number): void {
    for (const [mob, origOpacity] of this._savedOpacities) {
      Mobject.prototype.setStrokeOpacity.call(mob, origOpacity * factor);
    }
  }

  /**
   * Reveal one family member's own stroke segments up to `memberAlpha`,
   * sweeping a cumulative-length front across its subpaths in order. This is
   * the arc-length analogue of Manim CE's pointwise_become_partial: subpaths
   * of a single VMobject share one window and draw in sequence, never
   * staggered against each other.
   */
  private _revealMember(lines: Line2[], lengths: number[], memberAlpha: number): void {
    const totalLength = lengths.reduce((sum, len) => sum + len, 0);
    if (totalLength <= 0) return;
    let remaining = memberAlpha * totalLength;
    for (let i = 0; i < lines.length; i++) {
      const totalLen = lengths[i];
      const visibleLength = Math.max(0, Math.min(totalLen, remaining));
      setLine2RevealLength(lines[i], visibleLength, totalLen);
      remaining -= totalLen;
    }
  }

  /**
   * Interpolate the dash size to progressively reveal the stroke.
   * For filled VMobjects: first half draws border, second half fades in fill.
   * Staggering (lagRatio) applies across family members (this._family), never
   * across a single member's own subpaths.
   */
  interpolate(alpha: number): void {
    if (this._useDashReveal) {
      const n = this._family.length;

      if (this._hasFill) {
        // Two-phase animation: border then fill (like Manim's DrawBorderThenFill)
        const vmob = this.mobject as VMobject;
        if (alpha < 0.5) {
          vmob.setFillOpacity(0);
          const strokeAlpha = alpha * 2;
          for (let i = 0; i < n; i++) {
            const subAlpha = this.getSubAlpha(strokeAlpha, i, n, this._lagRatio);
            this._revealMember(this._memberLines[i], this._memberLineLengths[i], subAlpha);
          }
        } else {
          const fillAlpha = (alpha - 0.5) * 2;
          vmob.setFillOpacity(this._originalFillOpacity * fillAlpha);
          for (let i = 0; i < n; i++) {
            for (let j = 0; j < this._memberLines[i].length; j++) {
              const totalLen = this._memberLineLengths[i][j];
              const line = this._memberLines[i][j];
              const material = line.material as LineMaterial;
              if (material.dashed) {
                setLine2RevealLength(line, totalLen, totalLen);
              }
            }
          }
        }
      } else {
        // No fill: stroke reveal with per-family-member stagger
        for (let i = 0; i < n; i++) {
          const subAlpha = this.getSubAlpha(alpha, i, n, this._lagRatio);
          this._revealMember(this._memberLines[i], this._memberLineLengths[i], subAlpha);
        }
      }
    } else {
      this._applyScaledOpacities(alpha);
    }
  }

  /**
   * Ensure stroke is fully visible at the end
   */
  override finish(): void {
    if (this._useDashReveal) {
      // Restore fill opacity
      if (this._hasFill) {
        (this.mobject as VMobject).setFillOpacity(this._originalFillOpacity);
      }

      // Disable dashing, show full stroke
      for (const lines of this._memberLines) {
        for (const line of lines) {
          line.visible = true;
          const material = line.material as LineMaterial;
          material.dashed = false;
          material.needsUpdate = true;
        }
      }
    } else {
      this._applyScaledOpacities(1);
    }
    super.finish();
  }
}

/**
 * Create a Create animation for a mobject.
 * Progressively draws the mobject's stroke.
 * @param mobject The mobject to create (should be a VMobject)
 * @param options Animation options (duration, rateFunc)
 */
export function create(mobject: Mobject, options?: CreateOptions): Create {
  return new Create(mobject, options);
}

/**
 * DrawBorderThenFill - draws the border progressively, then fills.
 * A variant of Create that traces the stroke first, then fades in the fill.
 */
export class DrawBorderThenFill extends Animation {
  /** Whether to use dash-based reveal */
  private _useDashReveal: boolean = false;
  /** Total path length for dash-based reveal */
  private _totalLength: number = 1;
  /** Original fill opacity to restore */
  private _originalFillOpacity: number = 0;

  constructor(mobject: Mobject, options: AnimationOptions = {}) {
    // Manim default for DrawBorderThenFill is 2 seconds
    super(mobject, { duration: options.duration ?? 2, ...options });
  }

  override begin(): void {
    super.begin();
    this._useDashReveal = this.mobject instanceof VMobject && hasLine2Children(this.mobject);

    if (this._useDashReveal) {
      const vmob = this.mobject as VMobject;
      this._originalFillOpacity = vmob.fillOpacity;
      vmob.setFillOpacity(0); // Hide fill initially

      // Set up stroke tracing with dashes
      const threeObj = this.mobject.getThreeObject();
      threeObj.traverse((child) => {
        if (child instanceof Line2) {
          const material = child.material as LineMaterial;
          material.dashed = true;
          material.dashScale = 1;
          child.computeLineDistances();
          this._totalLength = getLine2TotalLength(child);
          setLine2RevealLength(child, 0, this._totalLength);
        }
      });
    }
  }

  interpolate(alpha: number): void {
    if (this._useDashReveal) {
      const vmob = this.mobject as VMobject;

      if (alpha < 0.5) {
        // First half: draw border with dash reveal
        const strokeAlpha = alpha * 2;
        const threeObj = this.mobject.getThreeObject();
        threeObj.traverse((child) => {
          if (child instanceof Line2) {
            const visibleLength = strokeAlpha * this._totalLength;
            setLine2RevealLength(child, visibleLength, this._totalLength);
          }
        });
      } else {
        // Second half: fill in
        const fillAlpha = (alpha - 0.5) * 2;
        vmob.setFillOpacity(this._originalFillOpacity * fillAlpha);

        // Ensure stroke is fully visible (disable dashing)
        const threeObj = this.mobject.getThreeObject();
        threeObj.traverse((child) => {
          if (child instanceof Line2) {
            child.visible = true;
            const material = child.material as LineMaterial;
            if (material.dashed) {
              material.dashed = false;
              material.needsUpdate = true;
            }
          }
        });
      }
    }
  }

  override finish(): void {
    if (this._useDashReveal) {
      const vmob = this.mobject as VMobject;
      vmob.setFillOpacity(this._originalFillOpacity);

      // Ensure dashing is disabled
      const threeObj = this.mobject.getThreeObject();
      threeObj.traverse((child) => {
        if (child instanceof Line2) {
          child.visible = true;
          const material = child.material as LineMaterial;
          material.dashed = false;
          material.needsUpdate = true;
        }
      });
    }
    super.finish();
  }
}

/**
 * Create a DrawBorderThenFill animation.
 */
export function drawBorderThenFill(
  mobject: Mobject,
  options?: AnimationOptions,
): DrawBorderThenFill {
  return new DrawBorderThenFill(mobject, options);
}

/**
 * Uncreate animation - reverse of Create, erases the stroke progressively.
 * Uses dashed lines to progressively hide the stroke from end to start.
 */
export class Uncreate extends Animation {
  /** Total path length for dash-based reveal */
  private _totalLength: number = 0;
  /** Whether to use dash-based reveal */
  private _useDashReveal: boolean = false;

  constructor(mobject: Mobject, options: AnimationOptions = {}) {
    // Manim default for Uncreate is 2 seconds
    super(mobject, { duration: options.duration ?? 2, ...options });
  }

  override begin(): void {
    super.begin();
    this._useDashReveal = this.mobject instanceof VMobject && hasLine2Children(this.mobject);

    if (this._useDashReveal) {
      const threeObj = this.mobject.getThreeObject();
      threeObj.traverse((child) => {
        if (child instanceof Line2) {
          const material = child.material as LineMaterial;
          material.dashed = true;
          material.dashScale = 1;

          child.computeLineDistances();
          this._totalLength = getLine2TotalLength(child);

          setLine2RevealLength(child, this._totalLength, this._totalLength);
        }
      });
    }
  }

  interpolate(alpha: number): void {
    if (this._useDashReveal) {
      const threeObj = this.mobject.getThreeObject();
      threeObj.traverse((child) => {
        if (child instanceof Line2) {
          const visibleLength = (1 - alpha) * this._totalLength;
          setLine2RevealLength(child, visibleLength, this._totalLength);
        }
      });
    } else {
      this.mobject.setStrokeOpacity(1 - alpha);
    }
  }

  override finish(): void {
    if (this._useDashReveal) {
      const threeObj = this.mobject.getThreeObject();
      threeObj.traverse((child) => {
        if (child instanceof Line2) {
          setLine2RevealLength(child, 0, this._totalLength);
        }
      });
    } else {
      this.mobject.setStrokeOpacity(0);
    }
    super.finish();
  }
}

/**
 * Create an Uncreate animation for a mobject.
 */
export function uncreate(mobject: Mobject, options?: AnimationOptions): Uncreate {
  return new Uncreate(mobject, options);
}

// =============================================================================
// Write Animations - specifically for Text mobjects
// =============================================================================

export interface WriteOptions extends AnimationOptions {
  /** Stagger between characters, default 0.05 */
  lagRatio?: number;
  /** Write in reverse (right to left), default false */
  reverse?: boolean;
  /** Remove after animation, default false */
  remover?: boolean;
  /** Ratio of animation time spent on stroke drawing vs cross-fade (default 0.7 = 70% stroke, 30% crossfade) */
  strokeRatio?: number;
  /**
   * When true, the Write animation uses the glyph's skeleton (medial axis)
   * for stroke drawing, producing natural center-line pen strokes instead
   * of perimeter outlines. Requires glyphs to be loaded with
   * `useSkeletonStroke: true`. Default: false (uses outline strokes).
   */
  useSkeletonStroke?: boolean;
}

/**
 * Write animation specifically for Text and MathTex mobjects.
 * Reveals text character by character with a pen-stroke effect.
 *
 * Rendering paths:
 * 1. Glyph stroke mode — Text with loaded glyph group (via loadGlyphs()) gets stroke-draw
 *    of each character's outline, then cross-fades to the Canvas 2D texture.
 * 2. Dash-based reveal — for VMobjects that already have Line2 children.
 * 3. Opacity fallback.
 */
export class Write extends Animation {
  protected readonly lagRatio: number;
  private _reverse: boolean;
  private _remover: boolean;
  private _strokeRatio: number;
  private _originalOpacity: number = 1;

  // Rendering mode flags (mutually exclusive)
  private _useGlyphStroke: boolean = false;
  private _useDashReveal: boolean = false;
  private _useRevealProgress: boolean = false;

  // Dash reveal state
  private _totalLength: number = 0;

  // Glyph stroke state
  private _glyphGroup: TextGlyphGroup | null = null;
  private _textMesh: THREE.Mesh | null = null;
  private _glyphTotalLengths: number[] = [];
  private _parentThreeObj: THREE.Object3D | null = null;

  // Skeleton stroke state: when a glyph has a skeleton, we create
  // a temporary VMobject with skeleton points and animate that instead.
  // _skeletonVMobs[i] is non-null if glyph child i has a skeleton path.
  private _skeletonVMobs: (VMobject | null)[] = [];
  private _skeletonTotalLengths: number[] = [];

  constructor(mobject: Mobject, options: WriteOptions = {}) {
    super(mobject, { duration: options.duration ?? 1, ...options });
    this.lagRatio = options.lagRatio ?? 0.05;
    this._reverse = options.reverse ?? false;
    this._remover = options.remover ?? false;
    this._strokeRatio = options.strokeRatio ?? 0.7;
  }

  override begin(): void {
    super.begin();
    this._originalOpacity = this.mobject.opacity;

    // Priority 1: Check for glyph stroke mode
    if (
      'getGlyphGroup' in this.mobject &&
      typeof (this.mobject as unknown as GlyphStrokeMobject).getGlyphGroup === 'function'
    ) {
      const glyphGroup = (this.mobject as unknown as GlyphStrokeMobject).getGlyphGroup();
      if (glyphGroup && glyphGroup.length > 0) {
        this._useGlyphStroke = true;
        this._glyphGroup = glyphGroup;
        this._beginGlyphStroke();
        return;
      }
    }

    // Priority 2: Left-to-right reveal for mobjects with setRevealProgress (MathTex)
    if (
      'setRevealProgress' in this.mobject &&
      typeof (this.mobject as unknown as RevealProgressMobject).setRevealProgress === 'function'
    ) {
      this._useRevealProgress = true;
      (this.mobject as unknown as RevealProgressMobject).setRevealProgress(this._reverse ? 1 : 0);
      return;
    }

    // Priority 3: Dash reveal for VMobjects with Line2
    this._useDashReveal = this.mobject instanceof VMobject && hasLine2Children(this.mobject);

    if (this._useDashReveal) {
      const threeObj = this.mobject.getThreeObject();
      threeObj.traverse((child) => {
        if (child instanceof Line2) {
          const material = child.material as LineMaterial;
          material.dashed = true;
          material.dashScale = 1;

          child.computeLineDistances();
          this._totalLength = getLine2TotalLength(child);

          setLine2RevealLength(child, this._reverse ? this._totalLength : 0, this._totalLength);
        }
      });
    } else {
      this.mobject.setStrokeOpacity(this._reverse ? this._originalOpacity : 0);
    }
  }

  /**
   * Set up glyph-stroke mode: hide the texture mesh, attach the glyph group
   * to the Text's Three.js parent, and prepare dash reveal for each glyph child.
   *
   * When a glyph has a skeleton path (medial axis), a temporary VMobject is
   * created with the skeleton points and used for the dash-reveal animation
   * instead of the outline. The outline glyph is hidden in that case.
   */
  private _beginGlyphStroke(): void {
    const glyphGroup = this._glyphGroup!;

    // Hide the Text's texture mesh
    if (
      'getTextureMesh' in this.mobject &&
      typeof (this.mobject as unknown as GlyphStrokeMobject).getTextureMesh === 'function'
    ) {
      this._textMesh = (this.mobject as unknown as GlyphStrokeMobject).getTextureMesh();
    }
    if (this._textMesh) {
      this._textMesh.visible = false;
    }

    // Attach glyph group's Three.js object to the Text's Three.js parent
    const textThreeObj = this.mobject.getThreeObject();
    this._parentThreeObj = textThreeObj;
    const glyphThreeObj = glyphGroup.getThreeObject();

    // Center the glyph group to match the centered canvas texture.
    // Compute bounding box BEFORE adding to parent so it's in local space.
    const glyphBounds = new THREE.Box3().setFromObject(glyphThreeObj);
    if (!glyphBounds.isEmpty()) {
      const glyphCenterX = (glyphBounds.min.x + glyphBounds.max.x) / 2;
      const glyphCenterY = (glyphBounds.min.y + glyphBounds.max.y) / 2;
      glyphThreeObj.position.x = -glyphCenterX;
      glyphThreeObj.position.y = -glyphCenterY;
    }
    this._parentThreeObj.add(glyphThreeObj);

    // Set up dash reveal for each glyph child's Line2 children
    this._glyphTotalLengths = [];
    this._skeletonVMobs = [];
    this._skeletonTotalLengths = [];
    const children = glyphGroup.children;

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const childThreeObj = child.getThreeObject();

      // Check if this glyph has a skeleton path
      const glyphChild = child as unknown as GlyphVMobject;
      let skeletonPath: number[][] | null = null;
      if (
        'getSkeletonPath' in glyphChild &&
        typeof (glyphChild as unknown as SkeletonPathMobject).getSkeletonPath === 'function'
      ) {
        skeletonPath = (glyphChild as unknown as SkeletonPathMobject).getSkeletonPath();
      }

      if (skeletonPath && skeletonPath.length >= 4) {
        // --- Skeleton mode for this glyph ---
        // Hide the outline glyph
        childThreeObj.visible = false;

        // Create a temporary VMobject with skeleton points
        const skelVMob = new VMobject();
        skelVMob.setColor(child.color || '#ffffff');
        skelVMob.strokeWidth = child.strokeWidth ?? 2;
        skelVMob.fillOpacity = 0;
        skelVMob.setPoints3D(skeletonPath);

        // Attach skeleton VMobject's Three.js object into the glyph group
        const skelThreeObj = skelVMob.getThreeObject();
        glyphThreeObj.add(skelThreeObj);

        // Set up dash reveal on the skeleton's Line2
        let skelTotalLen = 1;
        skelThreeObj.traverse((obj) => {
          if (obj instanceof Line2) {
            const material = obj.material as LineMaterial;
            material.dashed = true;
            material.dashScale = 1;

            obj.computeLineDistances();
            skelTotalLen = getLine2TotalLength(obj);

            setLine2RevealLength(obj, 0, skelTotalLen);
          }
        });

        this._skeletonVMobs.push(skelVMob);
        this._skeletonTotalLengths.push(skelTotalLen);
        this._glyphTotalLengths.push(1); // placeholder (unused when skeleton active)
      } else {
        // --- Standard outline mode for this glyph ---
        this._skeletonVMobs.push(null);
        this._skeletonTotalLengths.push(0);

        let totalLen = 1;
        childThreeObj.traverse((obj) => {
          if (obj instanceof Line2) {
            const material = obj.material as LineMaterial;
            material.dashed = true;
            material.dashScale = 1;

            obj.computeLineDistances();
            totalLen = getLine2TotalLength(obj);

            // Start fully hidden
            setLine2RevealLength(obj, 0, totalLen);
          }
        });

        this._glyphTotalLengths.push(totalLen);
      }
    }
  }

  interpolate(alpha: number): void {
    const effectiveAlpha = this._reverse ? 1 - alpha : alpha;

    if (this._useGlyphStroke) {
      this._interpolateGlyphStroke(effectiveAlpha);
    } else if (this._useRevealProgress) {
      (this.mobject as unknown as RevealProgressMobject).setRevealProgress(effectiveAlpha);
    } else if (this._useDashReveal) {
      const threeObj = this.mobject.getThreeObject();
      threeObj.traverse((child) => {
        if (child instanceof Line2) {
          const visibleLength = effectiveAlpha * this._totalLength;
          setLine2RevealLength(child, visibleLength, this._totalLength);
        }
      });
    } else {
      this.mobject.setStrokeOpacity(this._originalOpacity * effectiveAlpha);
    }
  }

  /**
   * Glyph stroke interpolation:
   * Phase 1 (0 -> strokeRatio): Dash-reveal glyph outlines (or skeletons) with lag stagger
   * Phase 2 (strokeRatio -> 1): Cross-fade from glyph strokes to texture mesh
   *
   * When a glyph has a skeleton VMobject, the skeleton is used for the
   * dash-reveal animation instead of the outline, producing a natural
   * center-line pen-stroke effect.
   */
  private _interpolateGlyphStroke(alpha: number): void {
    const glyphGroup = this._glyphGroup!;
    const children = glyphGroup.children;
    const numChildren = children.length;
    const strokeRatio = this._strokeRatio;

    if (alpha <= strokeRatio) {
      // Phase 1: Progressive dash-reveal across all glyph children
      const strokeAlpha = alpha / strokeRatio; // normalize to 0-1

      for (let i = 0; i < numChildren; i++) {
        // Compute per-character alpha with stagger
        const charStart = (i / numChildren) * (1 - this.lagRatio);
        const charEnd = charStart + this.lagRatio + (1 - this.lagRatio) / numChildren;
        const charAlpha = Math.max(
          0,
          Math.min(1, (strokeAlpha - charStart) / (charEnd - charStart)),
        );

        const skelVMob = this._skeletonVMobs[i];

        if (skelVMob) {
          // Skeleton mode: animate the skeleton VMobject
          const totalLen = this._skeletonTotalLengths[i] || 1;
          const skelThreeObj = skelVMob.getThreeObject();

          skelThreeObj.traverse((obj) => {
            if (obj instanceof Line2) {
              const visibleLength = charAlpha * totalLen;
              setLine2RevealLength(obj, visibleLength, totalLen);
            }
          });
        } else {
          // Standard outline mode
          const totalLen = this._glyphTotalLengths[i] || 1;
          const child = children[i];
          const childThreeObj = child.getThreeObject();

          childThreeObj.traverse((obj) => {
            if (obj instanceof Line2) {
              const visibleLength = charAlpha * totalLen;
              setLine2RevealLength(obj, visibleLength, totalLen);
            }
          });
        }
      }

      // Ensure texture mesh stays hidden during stroke phase
      if (this._textMesh) {
        this._textMesh.visible = false;
      }
    } else {
      // Phase 2: Cross-fade — strokes fully visible, fade in texture, fade out strokes
      const fadeAlpha = (alpha - strokeRatio) / (1 - strokeRatio); // normalize to 0-1

      // Ensure all glyph strokes are fully revealed, then fade out
      for (let i = 0; i < numChildren; i++) {
        const skelVMob = this._skeletonVMobs[i];

        if (skelVMob) {
          // Fade out skeleton stroke
          const totalLen = this._skeletonTotalLengths[i] || 1;
          const skelThreeObj = skelVMob.getThreeObject();

          skelThreeObj.traverse((obj) => {
            if (obj instanceof Line2) {
              setLine2RevealLength(obj, totalLen, totalLen);
              const material = obj.material as LineMaterial;
              material.opacity = 1 - fadeAlpha;
              material.needsUpdate = true;
            }
          });
        } else {
          // Fade out outline stroke
          const totalLen = this._glyphTotalLengths[i] || 1;
          const child = children[i];
          const childThreeObj = child.getThreeObject();

          childThreeObj.traverse((obj) => {
            if (obj instanceof Line2) {
              setLine2RevealLength(obj, totalLen, totalLen);
              const material = obj.material as LineMaterial;
              material.opacity = 1 - fadeAlpha;
              material.needsUpdate = true;
            }
          });
        }
      }

      // Fade in the texture mesh
      if (this._textMesh) {
        this._textMesh.visible = true;
        const material = this._textMesh.material as THREE.MeshBasicMaterial;
        if (material) {
          material.opacity = this._originalOpacity * fadeAlpha;
        }
      }
    }
  }

  override finish(): void {
    if (this._useGlyphStroke) {
      this._finishGlyphStroke();
      super.finish();
      return;
    }

    if (this._useRevealProgress) {
      if (this._remover) {
        (this.mobject as unknown as RevealProgressMobject).setRevealProgress(0);
      } else {
        (this.mobject as unknown as RevealProgressMobject).setRevealProgress(1);
      }
      super.finish();
      return;
    }

    if (this._remover) {
      if (this._useDashReveal) {
        const threeObj = this.mobject.getThreeObject();
        threeObj.traverse((child) => {
          if (child instanceof Line2) {
            setLine2RevealLength(child, 0, this._totalLength);
          }
        });
      }
      this.mobject.setStrokeOpacity(0);
    } else {
      if (this._useDashReveal) {
        const threeObj = this.mobject.getThreeObject();
        threeObj.traverse((child) => {
          if (child instanceof Line2) {
            child.visible = true;
            const material = child.material as LineMaterial;
            material.dashed = false;
            material.needsUpdate = true;
          }
        });
      }
      this.mobject.setStrokeOpacity(this._originalOpacity);
    }
    super.finish();
  }

  /**
   * Clean up glyph stroke mode: remove glyph group and skeleton VMobjects
   * from scene, restore texture mesh to full opacity.
   */
  private _finishGlyphStroke(): void {
    const glyphGroup = this._glyphGroup!;
    const glyphThreeObj = glyphGroup.getThreeObject();

    if (this._remover) {
      // Unwrite: hide everything
      if (this._textMesh) {
        this._textMesh.visible = false;
      }
      this.mobject.setStrokeOpacity(0);
    } else {
      // Write complete: show texture, hide glyphs
      if (this._textMesh) {
        this._textMesh.visible = true;
        const material = this._textMesh.material as THREE.MeshBasicMaterial;
        if (material) {
          material.opacity = this._originalOpacity;
        }
      }
      this.mobject.setStrokeOpacity(this._originalOpacity);
    }

    // Clean up skeleton VMobjects
    for (let i = 0; i < this._skeletonVMobs.length; i++) {
      const skelVMob = this._skeletonVMobs[i];
      if (skelVMob) {
        const skelThreeObj = skelVMob.getThreeObject();
        // Remove skeleton Three.js object from glyph group
        glyphThreeObj.remove(skelThreeObj);
        // Restore outline glyph visibility
        if (i < glyphGroup.children.length) {
          glyphGroup.children[i].getThreeObject().visible = true;
        }
        // Dispose skeleton VMobject resources
        skelVMob.dispose();
      }
    }
    this._skeletonVMobs = [];
    this._skeletonTotalLengths = [];

    // Remove glyph group from the Three.js scene
    if (this._parentThreeObj) {
      this._parentThreeObj.remove(glyphThreeObj);
    }

    // Disable dashing on glyph strokes
    for (const child of glyphGroup.children) {
      child.getThreeObject().traverse((obj) => {
        if (obj instanceof Line2) {
          obj.visible = true;
          const material = obj.material as LineMaterial;
          material.dashed = false;
          material.needsUpdate = true;
        }
      });
    }

    this._glyphGroup = null;
    this._textMesh = null;
    this._parentThreeObj = null;
  }
}

/**
 * Create a Write animation for a mobject.
 * Progressively reveals text with a pen-stroke effect.
 * @param mobject The mobject to write (typically Text or MathTex)
 * @param options Write animation options
 */
export function write(mobject: Mobject, options?: WriteOptions): Write {
  return new Write(mobject, options);
}

/**
 * Unwrite animation - reverse of Write, erases text character by character.
 */
export class Unwrite extends Write {
  constructor(mobject: Mobject, options: WriteOptions = {}) {
    super(mobject, { ...options, reverse: true, remover: true });
  }
}

/**
 * Create an Unwrite animation for a mobject.
 * Progressively erases text with a pen-stroke effect.
 * @param mobject The mobject to unwrite (typically Text or MathTex)
 * @param options Write animation options
 */
export function unwrite(mobject: Mobject, options?: WriteOptions): Unwrite {
  return new Unwrite(mobject, options);
}

// =============================================================================
// Letter-by-Letter Animations
// =============================================================================

export interface AddTextLetterByLetterOptions extends AnimationOptions {
  /** Time per character in seconds, default 0.1 */
  timePerChar?: number;
  /**
   * When true, animate in reverse: remove letters one by one instead of adding them.
   * Used internally by RemoveTextLetterByLetter.
   */
  reverse?: boolean;
}

/**
 * Types out text letter by letter (typewriter effect).
 * Works with Text mobjects that support partial text display.
 * When `reverse` is true, removes letters one by one instead.
 */
export class AddTextLetterByLetter extends Animation {
  /** Time per character for duration calculation */
  protected readonly timePerChar: number;
  /** Whether to run in reverse (remove letters) */
  protected readonly reverse: boolean;
  protected _fullText: string = '';

  constructor(mobject: Mobject, options: AddTextLetterByLetterOptions = {}) {
    const timePerChar = options.timePerChar ?? 0.1;
    // Duration depends on text length - will be set in begin()
    // For now, use a default or the provided duration
    super(mobject, { ...options, duration: options.duration ?? 1 });
    this.timePerChar = timePerChar;
    this.reverse = options.reverse ?? false;
  }

  override begin(): void {
    super.begin();
    if (
      'getText' in this.mobject &&
      typeof (this.mobject as unknown as TextAccessMobject).getText === 'function'
    ) {
      this._fullText = (this.mobject as unknown as TextAccessMobject).getText();
      if (
        !this.reverse &&
        'setText' in this.mobject &&
        typeof (this.mobject as unknown as TextAccessMobject).setText === 'function'
      ) {
        (this.mobject as unknown as TextAccessMobject).setText('');
      }
    }
  }

  interpolate(alpha: number): void {
    if (
      'setText' in this.mobject &&
      typeof (this.mobject as unknown as TextAccessMobject).setText === 'function' &&
      this._fullText
    ) {
      if (this.reverse) {
        const numCharsToRemove = Math.floor(alpha * this._fullText.length);
        const remainingChars = this._fullText.length - numCharsToRemove;
        (this.mobject as unknown as TextAccessMobject).setText(
          this._fullText.substring(0, remainingChars),
        );
      } else {
        const numChars = Math.floor(alpha * this._fullText.length);
        (this.mobject as unknown as TextAccessMobject).setText(
          this._fullText.substring(0, numChars),
        );
      }
    }
  }

  override finish(): void {
    if (
      'setText' in this.mobject &&
      typeof (this.mobject as unknown as TextAccessMobject).setText === 'function'
    ) {
      if (this.reverse) {
        (this.mobject as unknown as TextAccessMobject).setText('');
      } else if (this._fullText) {
        (this.mobject as unknown as TextAccessMobject).setText(this._fullText);
      }
    }
    super.finish();
  }
}

/**
 * Create an AddTextLetterByLetter animation.
 * Types out text letter by letter (typewriter effect).
 * @param mobject The mobject to animate (must support getText/setText)
 * @param options Animation options including timePerChar
 */
export function addTextLetterByLetter(
  mobject: Mobject,
  options?: AddTextLetterByLetterOptions,
): AddTextLetterByLetter {
  return new AddTextLetterByLetter(mobject, options);
}

/**
 * Removes text letter by letter (reverse typewriter effect).
 * Works with Text mobjects that support partial text display.
 *
 * Extends AddTextLetterByLetter with `reverse: true` — all logic is shared,
 * this class exists only for backward-compatible exports.
 */
export class RemoveTextLetterByLetter extends AddTextLetterByLetter {
  constructor(mobject: Mobject, options: AddTextLetterByLetterOptions = {}) {
    super(mobject, { ...options, reverse: true });
  }
}

/**
 * Create a RemoveTextLetterByLetter animation.
 * Removes text letter by letter (reverse typewriter effect).
 * @param mobject The mobject to animate (must support getText/setText)
 * @param options Animation options including timePerChar
 */
export function removeTextLetterByLetter(
  mobject: Mobject,
  options?: AddTextLetterByLetterOptions,
): RemoveTextLetterByLetter {
  return new RemoveTextLetterByLetter(mobject, options);
}
