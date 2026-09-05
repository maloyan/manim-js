// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import {
  Transform,
  ReplacementTransform,
  MoveToTarget,
  transform,
  replacementTransform,
  moveToTarget,
  MobjectWithTarget,
} from './transform/Transform';
import { ShapeMorphStrategy } from './transform/ShapeMorphStrategy';
import { Mobject } from '../core/Mobject';
import { TexturedMobject } from '../core/TexturedMobject';
import { VMobject } from '../core/VMobject';
import { VGroup } from '../core/VGroup';
import { Circle } from '../mobjects/geometry/Circle';
import { DashedLine } from '../mobjects/geometry/DashedLine';
import { RegularPolygram } from '../mobjects/geometry/PolygonExtensions';
import { PMobject } from '../mobjects/point/PMobject';
import { PointCloudMorphStrategy } from './transform/PointCloudMorphStrategy';
import { PointMorphStrategy } from './transform/PointMorphStrategy';
import { FadeMorphStrategy } from './transform/FadeMorphStrategy';
import { ImageMobject } from '../mobjects/image';
import { Text } from '../mobjects/text/Text';
import { MathTex } from '../mobjects/text/MathTex';
import { alignVmobjectPair } from './transform/TransformPairing';

/** Two circles with distinct styles for point-morphing tests. */
function makePair() {
  const c1 = new Circle({ radius: 1, color: '#ff0000', strokeWidth: 2 });
  c1.opacity = 0.8;
  c1.fillOpacity = 0.2;
  const c2 = new Circle({ radius: 2, color: '#0000ff', strokeWidth: 6 });
  c2.opacity = 0.4;
  c2.fillOpacity = 0.9;
  return { c1, c2 };
}

function vmWithPoints(pts: number[][]) {
  const vm = new VMobject();
  vm.setPoints(pts);
  return vm;
}

function collectVmobjectLeavesWithPoints(mobject: Mobject): VMobject[] {
  const out: VMobject[] = [];
  const vmChildren = mobject.children.filter((c): c is VMobject => c instanceof VMobject);
  if (
    mobject instanceof VMobject &&
    mobject.getLocalPoints().length > 0 &&
    vmChildren.length === 0
  ) {
    out.push(mobject);
  }
  for (const child of mobject.children) {
    out.push(...collectVmobjectLeavesWithPoints(child));
  }
  return out;
}

class SyncingTexturedMobject extends TexturedMobject {
  private _mesh: THREE.Mesh;
  private _width: number;
  private _height: number;

  constructor(width: number, height: number) {
    super();
    this._width = width;
    this._height = height;
    this._mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ transparent: true }),
    );
  }

  protected _createThreeObject(): THREE.Object3D {
    const group = new THREE.Group();
    group.add(this._mesh);
    return group;
  }

  override getDisplayMeshes(): THREE.Mesh[] {
    this.getThreeObject();
    return [this._mesh];
  }

  override getDisplayMeshLength(): number {
    return 1;
  }

  applyTextureFrom(_other: TexturedMobject): void {
    // no-op for test double
  }

  applyVisualSize(width: number, height: number): void {
    this._width = width;
    this._height = height;
    this._mesh.geometry.dispose();
    this._mesh.geometry = new THREE.PlaneGeometry(width, height);
    this._mesh.scale.set(1, 1, 1);
  }

  applyContentFrom(_other: TexturedMobject): void {
    // no-op for test double
  }

  protected override _syncMaterialToThree(): void {
    const geometry = this._mesh.geometry as THREE.PlaneGeometry;
    if (geometry.parameters.width !== this._width || geometry.parameters.height !== this._height) {
      this._mesh.geometry.dispose();
      this._mesh.geometry = new THREE.PlaneGeometry(this._width, this._height);
    }
  }

  override copy(): Mobject {
    const clone = new SyncingTexturedMobject(this._width, this._height);
    this._copyBaseAttributesInto(clone);
    return clone;
  }
}

describe('Transform', () => {
  describe('compound path final topology', () => {
    it('restores exact target points at finish for single-to-compound morph', () => {
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

      const t = new Transform(source, target);
      t.begin();
      t.interpolate(1);
      t.finish();

      expect(source.getLocalPoints()).toEqual(target.getLocalPoints());
      expect(source.getEffectiveSubpathLengths()).toEqual([5, 5]);
    });

    it('restores target subpath lengths at finish for compound shapes', () => {
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
        [0.7, 0.7, 0],
        [1.3, 0.7, 0],
        [1.3, 1.3, 0],
        [0.7, 1.3, 0],
        [0.7, 0.7, 0],
      ]);

      source.setBaseSubpathLengths([5]);
      target.setBaseSubpathLengths([5, 5]);

      const t = new Transform(source, target);
      t.begin();
      t.interpolate(0.999);
      t.interpolate(1);
      t.finish();

      // At finish we restore exact target topology metadata.
      expect(source.getEffectiveSubpathLengths()).toEqual([5, 5]);
    });

    it('produces equal-length aligned point lists for MathTex 1 -> 0', async () => {
      const one = new MathTex({ latex: '1' });
      const zero = new MathTex({ latex: '0' });
      await Promise.all([one.waitForRender(), zero.waitForRender()]);

      const oneLeaves = collectVmobjectLeavesWithPoints(one);
      const zeroLeaves = collectVmobjectLeavesWithPoints(zero);
      expect(oneLeaves.length).toBeGreaterThan(0);
      expect(zeroLeaves.length).toBeGreaterThan(0);

      // The compound alignment must produce equal-length aligned point
      // lists with subpath-length metadata that sums to that length.
      // (A previous incarnation of this test pinned the "src[0] closest
      // to some tgt anchor" heuristic, which the new arc-length / per-
      // subpath SSD pipeline intentionally replaces.)
      const aligned = alignVmobjectPair(oneLeaves[0], zeroLeaves[0]);
      expect(aligned.startPoints.length).toBe(aligned.targetPoints.length);
      expect(aligned.startPoints.length).toBeGreaterThan(0);
      if (aligned.alignedSubpathLengths) {
        const sum = aligned.alignedSubpathLengths.reduce((s, n) => s + n, 0);
        expect(sum).toBe(aligned.startPoints.length);
      }
    });
  });
  it('stores mobject, target, and defaults to 1s duration', () => {
    const { c1, c2 } = makePair();
    const t = new Transform(c1, c2);
    expect(t.mobject).toBe(c1);
    expect(t.target).toBe(c2);
    expect(t.duration).toBe(1);
  });

  it('accepts custom duration', () => {
    const { c1, c2 } = makePair();
    expect(new Transform(c1, c2, { duration: 2.5 }).duration).toBeCloseTo(2.5, 5);
  });

  describe('begin() with two VMobjects (point morphing)', () => {
    it('captures start and target points', () => {
      const { c1, c2 } = makePair();
      const startLen = c1.getLocalPoints().length;
      const t = new Transform(c1, c2);
      t.begin();
      expect(c1.getLocalPoints().length).toBeGreaterThan(0);
      expect(startLen).toBeGreaterThan(0);
    });

    it('captures style start values (verified at alpha 0)', () => {
      const { c1, c2 } = makePair();
      const t = new Transform(c1, c2);
      t.begin();
      t.interpolate(0);
      expect(c1.opacity).toBeCloseTo(0.8, 5);
      expect(c1.fillOpacity).toBeCloseTo(0.2, 5);
      expect(c1.strokeWidth).toBeCloseTo(2, 5);
    });
  });

  describe('interpolate() – point morphing', () => {
    it('at alpha 0 points stay at start', () => {
      const { c1, c2 } = makePair();
      const startPts = c1.getLocalPoints().map((p) => [...p]);
      const t = new Transform(c1, c2);
      t.begin();
      t.interpolate(0);
      const pts = c1.getLocalPoints();
      const n = Math.min(pts.length, startPts.length);
      for (let i = 0; i < n; i++) {
        expect(pts[i][0]).toBeCloseTo(startPts[i][0], 3);
        expect(pts[i][1]).toBeCloseTo(startPts[i][1], 3);
        expect(pts[i][2]).toBeCloseTo(startPts[i][2], 3);
      }
    });

    it('at alpha 1 points reach target', () => {
      const { c1, c2 } = makePair();
      const t = new Transform(c1, c2);
      t.begin();
      t.interpolate(1);
      const pts = c1.getLocalPoints();
      expect(pts.length).toBeGreaterThan(0);
      expect(typeof pts[pts.length - 1][0]).toBe('number');
    });

    it('at alpha 0.5 points are interpolated halfway', () => {
      const vm1 = vmWithPoints([
        [0, 0, 0],
        [4, 0, 0],
        [4, 4, 0],
        [0, 4, 0],
      ]);
      const vm2 = vmWithPoints([
        [2, 0, 0],
        [6, 0, 0],
        [6, 4, 0],
        [2, 4, 0],
      ]);
      const t = new Transform(vm1, vm2);
      t.begin();
      t.interpolate(0.5);
      const pts = vm1.getLocalPoints();
      expect(pts[0][0]).toBeCloseTo(1, 5);
      expect(pts[0][1]).toBeCloseTo(0, 5);
      expect(pts[1][0]).toBeCloseTo(5, 5);
    });
  });

  describe('style interpolation', () => {
    it('opacity lerps between source and target', () => {
      const { c1, c2 } = makePair();
      const t = new Transform(c1, c2);
      t.begin();
      t.interpolate(0);
      expect(c1.opacity).toBeCloseTo(0.8, 5);
      t.interpolate(0.5);
      expect(c1.opacity).toBeCloseTo(0.6, 5); // 0.8 + (0.4-0.8)*0.5
      t.interpolate(1);
      expect(c1.opacity).toBeCloseTo(0.4, 5);
    });

    it('fillOpacity lerps between source and target', () => {
      const { c1, c2 } = makePair();
      const t = new Transform(c1, c2);
      t.begin();
      t.interpolate(0);
      expect(c1.fillOpacity).toBeCloseTo(0.2, 5);
      t.interpolate(0.5);
      expect(c1.fillOpacity).toBeCloseTo(0.55, 5); // 0.2 + (0.9-0.2)*0.5
      t.interpolate(1);
      expect(c1.fillOpacity).toBeCloseTo(0.9, 5);
    });

    it('strokeWidth lerps between source and target', () => {
      const { c1, c2 } = makePair();
      const t = new Transform(c1, c2);
      t.begin();
      t.interpolate(0);
      expect(c1.strokeWidth).toBeCloseTo(2, 5);
      t.interpolate(0.5);
      expect(c1.strokeWidth).toBeCloseTo(4, 5); // 2 + (6-2)*0.5
      t.interpolate(1);
      expect(c1.strokeWidth).toBeCloseTo(6, 5);
    });
  });

  describe('color interpolation', () => {
    it('stroke color lerps between source and target colors', () => {
      const { c1, c2 } = makePair();
      const t = new Transform(c1, c2);
      t.begin();
      t.interpolate(0);
      expect(new THREE.Color(c1.color).r).toBeCloseTo(1.0, 2); // red
      t.interpolate(1);
      expect(new THREE.Color(c1.color).b).toBeCloseTo(1.0, 2); // blue
      t.interpolate(0.5);
      const mid = new THREE.Color(c1.color);
      expect(mid.r).toBeCloseTo(0.5, 1);
      expect(mid.b).toBeCloseTo(0.5, 1);
    });

    it('fill color lerps when source and target differ', () => {
      const c1 = new Circle({ radius: 1, color: '#ff0000' });
      c1.fillColor = '#00ff00';
      c1.fillOpacity = 0.5;
      const c2 = new Circle({ radius: 2, color: '#0000ff' });
      c2.fillColor = '#ff00ff';
      c2.fillOpacity = 0.5;
      const t = new Transform(c1, c2);
      t.begin();
      t.interpolate(0);
      expect(new THREE.Color(c1.fillColor ?? c1.color).g).toBeCloseTo(1.0, 1);
      t.interpolate(1);
      const end = new THREE.Color(c1.fillColor ?? c1.color);
      expect(end.r).toBeCloseTo(1.0, 1);
      expect(end.b).toBeCloseTo(1.0, 1);
    });
  });

  describe('position interpolation', () => {
    it('source position lerps toward target position', () => {
      const c1 = new Circle({ radius: 1 });
      c1.position.set(0, 0, 0);
      const c2 = new Circle({ radius: 1 });
      c2.position.set(4, 2, 0);
      const t = new Transform(c1, c2);
      t.begin();
      t.interpolate(0);
      expect(c1.position.x).toBeCloseTo(0, 5);
      expect(c1.position.y).toBeCloseTo(0, 5);
      t.interpolate(0.5);
      expect(c1.position.x).toBeCloseTo(2, 5);
      expect(c1.position.y).toBeCloseTo(1, 5);
      t.interpolate(1);
      expect(c1.position.x).toBeCloseTo(4, 5);
      expect(c1.position.y).toBeCloseTo(2, 5);
    });
  });

  describe('finish()', () => {
    it('sets final points, styles, and color from target', () => {
      const { c1, c2 } = makePair();
      const t = new Transform(c1, c2);
      t.begin();
      t.finish();
      expect(c1.opacity).toBeCloseTo(c2.opacity, 5);
      expect(c1.fillOpacity).toBeCloseTo(c2.fillOpacity, 5);
      expect(c1.strokeWidth).toBeCloseTo(c2.strokeWidth, 5);
      expect(c1.color.toLowerCase()).toBe(c2.color.toLowerCase());
    });

    it('sets final position from target', () => {
      const c1 = new Circle({ radius: 1 });
      c1.position.set(0, 0, 0);
      const c2 = new Circle({ radius: 1 });
      c2.position.set(3, 5, 0);
      const t = new Transform(c1, c2);
      t.begin();
      t.finish();
      expect(c1.position.x).toBeCloseTo(3, 5);
      expect(c1.position.y).toBeCloseTo(5, 5);
    });

    it('marks the animation as finished', () => {
      const { c1, c2 } = makePair();
      const t = new Transform(c1, c2);
      t.begin();
      expect(t.isFinished()).toBe(false);
      t.finish();
      expect(t.isFinished()).toBe(true);
    });
  });

  describe('cross-fade mode', () => {
    it('uses cross-fade when both VMobjects have zero points', () => {
      const vm1 = new VMobject();
      const vm2 = new VMobject();
      vm1.opacity = 1;
      vm2.opacity = 1;
      const t = new Transform(vm1, vm2);
      t.begin();
      t.interpolate(0);
      expect(vm1.opacity).toBeCloseTo(1, 5);
      t.interpolate(0.5);
      expect(vm1.opacity).toBeCloseTo(0.5, 5); // 1*(1-0.5)
      t.interpolate(1);
      expect(vm1.opacity).toBeCloseTo(0, 5);
    });

    it('uses cross-fade when source is a non-VMobject Mobject', () => {
      class SimpleMobject extends Mobject {
        protected _createThreeObject(): THREE.Object3D {
          return new THREE.Group();
        }
        override copy(): Mobject {
          const clone = new SimpleMobject();
          this._copyBaseAttributesInto(clone);
          return clone;
        }
      }
      const m1 = new SimpleMobject();
      const m2 = new SimpleMobject();
      m1.opacity = 1;
      m2.opacity = 1;
      const t = new Transform(m1, m2);
      t.begin();
      t.interpolate(0.5);
      expect(m1.opacity).toBeCloseTo(0.5, 5);
    });
  });

  describe('rotation and scale interpolation', () => {
    it('euler angles lerp between source and target', () => {
      const c1 = new Circle({ radius: 1 });
      c1.rotation.set(0, 0, 0);
      const c2 = new Circle({ radius: 1 });
      c2.rotation.set(Math.PI, 0, 0);
      const t = new Transform(c1, c2);
      t.begin();
      t.interpolate(0.5);
      expect(c1.rotation.x).toBeCloseTo(Math.PI / 2, 5);
    });

    it('scaleVector lerps between source and target', () => {
      const c1 = new Circle({ radius: 1 });
      c1.scaleVector.set(1, 1, 1);
      const c2 = new Circle({ radius: 1 });
      c2.scaleVector.set(3, 3, 3);
      const t = new Transform(c1, c2);
      t.begin();
      t.interpolate(0.5);
      expect(c1.scaleVector.x).toBeCloseTo(2, 5);
      expect(c1.scaleVector.y).toBeCloseTo(2, 5);
      expect(c1.scaleVector.z).toBeCloseTo(2, 5);
    });
  });
});

describe('ReplacementTransform', () => {
  it('extends Transform and stores mobject/target', () => {
    const { c1, c2 } = makePair();
    const rt = new ReplacementTransform(c1, c2);
    expect(rt).toBeInstanceOf(Transform);
    expect(rt.mobject).toBe(c1);
    expect(rt.target).toBe(c2);
  });

  it('inherits point morphing interpolation', () => {
    const { c1, c2 } = makePair();
    const rt = new ReplacementTransform(c1, c2);
    rt.begin();
    rt.interpolate(0);
    expect(c1.opacity).toBeCloseTo(0.8, 5);
    rt.interpolate(0.5);
    expect(c1.opacity).toBeCloseTo(0.6, 5);
    rt.interpolate(1);
    expect(c1.opacity).toBeCloseTo(0.4, 5);
  });

  it('finish marks animation as finished', () => {
    const { c1, c2 } = makePair();
    const rt = new ReplacementTransform(c1, c2);
    rt.begin();
    rt.finish();
    expect(rt.isFinished()).toBe(true);
  });

  describe('cleanUpFromScene (issue #308)', () => {
    function makeFakeScene() {
      const set = new Set<Mobject>();
      return {
        set,
        scene: {
          add: (...ms: Mobject[]) => ms.forEach((m) => set.add(m)),
          remove: (...ms: Mobject[]) => ms.forEach((m) => set.delete(m)),
        },
      };
    }

    it('removes source and adds target after the animation', () => {
      const { c1, c2 } = makePair();
      const { set, scene } = makeFakeScene();
      scene.add(c1);
      const rt = new ReplacementTransform(c1, c2);
      rt.begin();
      rt.finish();
      rt.cleanUpFromScene(scene);
      expect(set.has(c1)).toBe(false);
      expect(set.has(c2)).toBe(true);
    });

    it('plain Transform leaves scene membership unchanged', () => {
      const { c1, c2 } = makePair();
      const { set, scene } = makeFakeScene();
      scene.add(c1);
      const t = new Transform(c1, c2);
      t.begin();
      t.finish();
      t.cleanUpFromScene(scene);
      expect(set.has(c1)).toBe(true);
      expect(set.has(c2)).toBe(false);
    });

    it('adding target is idempotent if it was already in the scene', () => {
      const { c1, c2 } = makePair();
      const { set, scene } = makeFakeScene();
      scene.add(c1);
      scene.add(c2);
      const rt = new ReplacementTransform(c1, c2);
      rt.cleanUpFromScene(scene);
      expect(set.has(c1)).toBe(false);
      expect(set.has(c2)).toBe(true);
    });
  });
});

describe('MoveToTarget', () => {
  it('throws if mobject.targetCopy is null', () => {
    const c = new Circle({ radius: 1 });
    expect(() => {
      new MoveToTarget(c as unknown as MobjectWithTarget);
    }).toThrow('MoveToTarget requires mobject.targetCopy to be set');
  });

  it('works when targetCopy is set via generateTarget', () => {
    const c = new Circle({ radius: 1, color: '#ff0000' });
    c.opacity = 1;
    c.generateTarget();
    (c.targetCopy as VMobject).opacity = 0.3;
    (c.targetCopy as Circle).position.set(5, 0, 0);
    const mt = new MoveToTarget(c as unknown as MobjectWithTarget);
    expect(mt.mobject).toBe(c);
    expect(mt.target).toBe(c.targetCopy);
    mt.begin();
    mt.interpolate(0.5);
    expect(c.opacity).toBeCloseTo(0.65, 5); // 1 + (0.3-1)*0.5
    expect(c.position.x).toBeCloseTo(2.5, 5);
  });

  it('issue #306: ImageMobject MoveToTarget applies scaling and persists final size', async () => {
    const mockCanvas2DContext = {
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low' as const,
      createImageData: (width: number, height: number) => ({
        data: new Uint8ClampedArray(width * height * 4),
        width,
        height,
      }),
      putImageData: () => {},
      drawImage: () => {},
    };

    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tagName: string): HTMLElement => {
        const el = originalCreateElement(tagName);
        if (tagName.toLowerCase() === 'canvas') {
          (el as HTMLCanvasElement).getContext = ((contextType: string) =>
            contextType === '2d' ? mockCanvas2DContext : null) as HTMLCanvasElement['getContext'];
        }
        return el;
      });

    try {
      const image = new ImageMobject({
        pixelData: [
          [0, 255],
          [255, 0],
        ],
        height: 2,
      });

      await image.waitForLoad();
      const startWidth = image.getBoundingBox().width;

      const target = image.generateTarget() as ImageMobject;
      target.scale(2);
      const expectedWidth = target.getBoundingBox().width;

      const move = new MoveToTarget(image as unknown as MobjectWithTarget);
      move.begin();
      move.interpolate(1);
      move.finish();

      const finalWidth = image.getBoundingBox().width;
      expect(finalWidth).toBeCloseTo(expectedWidth, 5);
      expect(finalWidth).toBeGreaterThan(startWidth);
    } finally {
      createElementSpy.mockRestore();
    }
  });

  it('Transform to a shifted ImageMobject interpolates position (translation)', async () => {
    const mockCanvas2DContext = {
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low' as const,
      createImageData: (width: number, height: number) => ({
        data: new Uint8ClampedArray(width * height * 4),
        width,
        height,
      }),
      putImageData: () => {},
      drawImage: () => {},
    };

    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tagName: string): HTMLElement => {
        const el = originalCreateElement(tagName);
        if (tagName.toLowerCase() === 'canvas') {
          (el as HTMLCanvasElement).getContext = ((contextType: string) =>
            contextType === '2d' ? mockCanvas2DContext : null) as HTMLCanvasElement['getContext'];
        }
        return el;
      });

    try {
      const pixelData = [
        [0, 255],
        [255, 0],
      ];
      const image = new ImageMobject({ pixelData, height: 2 });
      const target = new ImageMobject({ pixelData, height: 2 });
      await image.waitForLoad();
      await target.waitForLoad();
      // Pure translation: identical image shifted right by 3 units. Regression
      // for ImageMobject.copy() dropping position, which made ShapeMorphStrategy
      // read a 0→0 start/target and never translate.
      target.shift([3, 0, 0]);

      const t = new Transform(image, target);
      t.begin();
      t.interpolate(0.5);
      expect(image.position.x).toBeCloseTo(1.5, 5);
      t.interpolate(1);
      t.finish();
      expect(image.position.x).toBeCloseTo(3, 5);
    } finally {
      createElementSpy.mockRestore();
    }
  });
});

describe('factory functions', () => {
  it('transform() creates Transform with options', () => {
    const { c1, c2 } = makePair();
    const t = transform(c1, c2, { duration: 3 });
    expect(t).toBeInstanceOf(Transform);
    expect(t.mobject).toBe(c1);
    expect(t.target).toBe(c2);
    expect(t.duration).toBeCloseTo(3, 5);
  });

  it('replacementTransform() creates ReplacementTransform with options', () => {
    const { c1, c2 } = makePair();
    const rt = replacementTransform(c1, c2, { duration: 0.5 });
    expect(rt).toBeInstanceOf(ReplacementTransform);
    expect(rt).toBeInstanceOf(Transform);
    expect(rt.mobject).toBe(c1);
    expect(rt.target).toBe(c2);
    expect(rt.duration).toBeCloseTo(0.5, 5);
  });

  it('moveToTarget() creates MoveToTarget', () => {
    const c = new Circle({ radius: 1 });
    c.generateTarget();
    const mt = moveToTarget(c as unknown as MobjectWithTarget);
    expect(mt).toBeInstanceOf(MoveToTarget);
    expect(mt).toBeInstanceOf(Transform);
  });

  it('moveToTarget() throws without targetCopy', () => {
    const c = new Circle({ radius: 1 });
    expect(() => {
      moveToTarget(c as unknown as MobjectWithTarget);
    }).toThrow('MoveToTarget requires mobject.targetCopy to be set');
  });
});

describe('edge cases', () => {
  it('identical source and target is a no-op', () => {
    const c1 = new Circle({ radius: 1, color: '#ff0000' });
    c1.opacity = 1;
    c1.fillOpacity = 0.5;
    const c2 = new Circle({ radius: 1, color: '#ff0000' });
    c2.opacity = 1;
    c2.fillOpacity = 0.5;
    const t = new Transform(c1, c2);
    t.begin();
    t.interpolate(0.5);
    expect(c1.opacity).toBeCloseTo(1, 5);
    expect(c1.fillOpacity).toBeCloseTo(0.5, 5);
  });

  it('manually set VMobject points interpolate correctly', () => {
    const vm1 = vmWithPoints([
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
      [0, 1, 0],
    ]);
    const vm2 = vmWithPoints([
      [2, 2, 0],
      [3, 2, 0],
      [3, 3, 0],
      [2, 3, 0],
    ]);
    const t = new Transform(vm1, vm2);
    t.begin();
    t.interpolate(0);
    expect(vm1.getLocalPoints()[0][0]).toBeCloseTo(0, 5);
    expect(vm1.getLocalPoints()[0][1]).toBeCloseTo(0, 5);
    t.interpolate(1);
    expect(vm1.getLocalPoints()[0][0]).toBeCloseTo(2, 5);
    expect(vm1.getLocalPoints()[0][1]).toBeCloseTo(2, 5);
    expect(vm1.getLocalPoints()[2][0]).toBeCloseTo(3, 5);
    expect(vm1.getLocalPoints()[2][1]).toBeCloseTo(3, 5);
  });

  it('multiple interpolate calls update progressively', () => {
    const { c1, c2 } = makePair();
    const t = new Transform(c1, c2);
    t.begin();
    t.interpolate(0.25);
    expect(c1.opacity).toBeCloseTo(0.7, 5); // 0.8 + (0.4-0.8)*0.25
    t.interpolate(0.75);
    expect(c1.opacity).toBeCloseTo(0.5, 5); // 0.8 + (0.4-0.8)*0.75
  });

  it('zero-duration transform is valid', () => {
    const { c1, c2 } = makePair();
    const t = new Transform(c1, c2, { duration: 0 });
    expect(t.duration).toBe(0);
    t.begin();
    t.interpolate(1);
    expect(c1.opacity).toBeCloseTo(c2.opacity, 5);
  });
});

describe('cross-fade finish()', () => {
  it('finish() reparents target under source for non-VMobject Mobjects', () => {
    class SimpleMobject extends Mobject {
      protected _createThreeObject(): THREE.Object3D {
        return new THREE.Group();
      }
      override copy(): Mobject {
        const clone = new SimpleMobject();
        this._copyBaseAttributesInto(clone);
        return clone;
      }
    }
    const m1 = new SimpleMobject();
    const m2 = new SimpleMobject();
    m1.opacity = 1;
    m2.opacity = 0.7;

    // Give them different positions
    m1.position.set(0, 0, 0);
    m2.position.set(3, 4, 0);

    // Attach m1 to a parent so the scene graph add logic works
    const parent = new THREE.Group();
    parent.add(m1.getThreeObject());

    const t = new Transform(m1, m2);
    t.begin();
    t.interpolate(0.5);
    t.finish();

    // After cross-fade finish, source opacity should be 0
    // and target should be reparented under source
    expect(m1.opacity).toBeCloseTo(0, 3);
    expect(t.isFinished()).toBe(true);
  });

  it('finish() handles cross-fade for VMobjects with zero points', () => {
    const vm1 = new VMobject();
    const vm2 = new VMobject();
    vm1.opacity = 1;
    vm2.opacity = 0.8;
    vm1.position.set(0, 0, 0);
    vm2.position.set(2, 3, 0);

    // Attach vm1 to a parent so cross-fade path adds target to scene graph
    const parent = new THREE.Group();
    parent.add(vm1.getThreeObject());

    const t = new Transform(vm1, vm2);
    t.begin();
    t.interpolate(0.5);
    t.finish();

    // The non-Text cross-fade path should execute finish without error
    expect(t.isFinished()).toBe(true);
  });

  it('cross-fade adds target to scene graph when source has parent', () => {
    class SimpleMobject extends Mobject {
      protected _createThreeObject(): THREE.Object3D {
        return new THREE.Group();
      }
      override copy(): Mobject {
        const clone = new SimpleMobject();
        this._copyBaseAttributesInto(clone);
        return clone;
      }
    }
    const m1 = new SimpleMobject();
    const m2 = new SimpleMobject();

    // Source attached to parent, target is not
    const parent = new THREE.Group();
    parent.add(m1.getThreeObject());
    expect(m2.getThreeObject().parent).toBeFalsy();

    const t = new Transform(m1, m2);
    t.begin();

    // After begin(), target should be added to the same parent
    // because sourceObj.parent exists and targetObj has no parent
    expect(m2.getThreeObject().parent).toBeTruthy();
  });

  it('cross-fade position interpolation works for non-VMobject', () => {
    class SimpleMobject extends Mobject {
      protected _createThreeObject(): THREE.Object3D {
        return new THREE.Group();
      }
      override copy(): Mobject {
        const clone = new SimpleMobject();
        this._copyBaseAttributesInto(clone);
        return clone;
      }
    }
    const m1 = new SimpleMobject();
    const m2 = new SimpleMobject();
    m1.position.set(0, 0, 0);
    m2.position.set(10, 0, 0);
    m1.opacity = 1;
    m2.opacity = 1;

    const t = new Transform(m1, m2);
    t.begin();
    t.interpolate(0.5);

    // Position should be interpolated halfway
    expect(m1.position.x).toBeCloseTo(5, 3);
  });

  it('cross-fade for zero-point VMobjects interpolates position', () => {
    const vm1 = new VMobject();
    const vm2 = new VMobject();
    vm1.position.set(0, 0, 0);
    vm2.position.set(6, 0, 0);
    vm1.opacity = 1;
    vm2.opacity = 1;

    const parent = new THREE.Group();
    parent.add(vm1.getThreeObject());

    const t = new Transform(vm1, vm2);
    t.begin();
    t.interpolate(0.5);

    // Position should be halfway
    expect(vm1.position.x).toBeCloseTo(3, 3);
    // Opacity should be fading out (source: 1*(1-0.5) = 0.5)
    expect(vm1.opacity).toBeCloseTo(0.5, 3);
  });
});

describe('cross-fade finish() with getTextureMesh (Text-like)', () => {
  it('swaps texture and geometry when both source and target have getTextureMesh', () => {
    // Create mobjects that look like Text objects with getTextureMesh
    class TextLikeMobject extends Mobject {
      private _mesh: THREE.Mesh;

      constructor() {
        super();
        const geometry = new THREE.PlaneGeometry(1, 1);
        // Use a DataTexture instead of CanvasTexture to avoid DOM dependency
        const dataTexture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
        const material = new THREE.MeshBasicMaterial({
          transparent: true,
          map: dataTexture,
        });
        this._mesh = new THREE.Mesh(geometry, material);
      }

      protected _createThreeObject(): THREE.Object3D {
        const group = new THREE.Group();
        group.add(this._mesh);
        return group;
      }

      getTextureMesh(): THREE.Mesh | null {
        return this._mesh;
      }

      override copy(): Mobject {
        const clone = new TextLikeMobject();
        this._copyBaseAttributesInto(clone);
        return clone;
      }
    }

    const m1 = new TextLikeMobject();
    const m2 = new TextLikeMobject();
    m1.opacity = 1;
    m2.opacity = 0.8;
    m1.position.set(0, 0, 0);
    m2.position.set(2, 3, 0);

    // Attach m1 to a parent so cross-fade begin() works
    const parent = new THREE.Group();
    parent.add(m1.getThreeObject());

    const t = new Transform(m1, m2);
    t.begin();
    t.interpolate(0.5);
    t.finish();

    // After Text-like cross-fade finish:
    // source should be positioned at target location
    expect(m1.position.x).toBeCloseTo(2, 3);
    expect(m1.position.y).toBeCloseTo(3, 3);
    expect(t.isFinished()).toBe(true);
  });

  it('leaves target in scene graph after fade finish so it remains visible', () => {
    class TextLikeMobject extends Mobject {
      private _mesh: THREE.Mesh;

      constructor() {
        super();
        const geometry = new THREE.PlaneGeometry(1, 1);
        const dataTexture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
        const material = new THREE.MeshBasicMaterial({
          transparent: true,
          map: dataTexture,
        });
        this._mesh = new THREE.Mesh(geometry, material);
      }

      protected _createThreeObject(): THREE.Object3D {
        const group = new THREE.Group();
        group.add(this._mesh);
        return group;
      }

      getTextureMesh(): THREE.Mesh | null {
        return this._mesh;
      }

      override copy(): Mobject {
        const clone = new TextLikeMobject();
        this._copyBaseAttributesInto(clone);
        return clone;
      }
    }

    const m1 = new TextLikeMobject();
    const m2 = new TextLikeMobject();
    m1.opacity = 1;
    m2.opacity = 1;

    const parent = new THREE.Group();
    parent.add(m1.getThreeObject());

    const t = new Transform(m1, m2);
    t.begin();

    // Target should have been added to scene graph during begin()
    expect(m2.getThreeObject().parent).toBeTruthy();

    t.finish();

    // After finish, target should remain in scene graph so it stays visible
    expect(m2.getThreeObject().parent).toBeTruthy();
  });
});

describe('finish() with fill color interpolation', () => {
  it('sets final fill color when source and target differ', () => {
    const c1 = new Circle({ radius: 1, color: '#ff0000' });
    c1.fillColor = '#00ff00';
    c1.fillOpacity = 0.5;
    const c2 = new Circle({ radius: 2, color: '#0000ff' });
    c2.fillColor = '#ff00ff';
    c2.fillOpacity = 0.5;

    const t = new Transform(c1, c2);
    t.begin();
    t.finish();

    // fillColor should match target
    const finalFill = new THREE.Color(c1.fillColor ?? c1.color);
    const expectedFill = new THREE.Color('#ff00ff');
    expect(finalFill.r).toBeCloseTo(expectedFill.r, 1);
    expect(finalFill.g).toBeCloseTo(expectedFill.g, 1);
    expect(finalFill.b).toBeCloseTo(expectedFill.b, 1);
  });

  it('finish() sets rotation and scale from target', () => {
    const c1 = new Circle({ radius: 1 });
    c1.rotation.set(0, 0, 0);
    c1.scaleVector.set(1, 1, 1);
    const c2 = new Circle({ radius: 1 });
    c2.rotation.set(Math.PI / 4, Math.PI / 2, 0);
    c2.scaleVector.set(2, 3, 1);

    const t = new Transform(c1, c2);
    t.begin();
    t.finish();

    expect(c1.rotation.x).toBeCloseTo(Math.PI / 4, 5);
    expect(c1.rotation.y).toBeCloseTo(Math.PI / 2, 5);
    expect(c1.scaleVector.x).toBeCloseTo(2, 5);
    expect(c1.scaleVector.y).toBeCloseTo(3, 5);
  });
});

describe('Transform on VGroup (#206)', () => {
  it('begin/interpolate/finish does not crash with material-is-null', () => {
    const circle = new Circle({ radius: 1 });
    const group = new VGroup(circle);

    const target = group.copy() as VGroup;
    target.scale(2);
    target.shift([2, 0, 0]);

    const t = new Transform(group, target);
    // This used to throw "can't access property visible, material is null"
    expect(() => {
      t.begin();
      t.interpolate(0);
      t.interpolate(0.5);
      t.interpolate(1);
      t.finish();
    }).not.toThrow();
  });

  it('keeps VGroup anchors identity and still reaches scaled child geometry', () => {
    const circle = new Circle({ radius: 1 });
    const group = new VGroup(circle);

    const target = group.copy() as VGroup;
    target.scale(2);

    const t = new Transform(group, target);
    t.begin();
    t.interpolate(1);

    expect(group.position.x).toBe(0);
    expect(group.position.y).toBe(0);
    expect(group.position.z).toBe(0);
    expect(group.scaleVector.x).toBe(1);
    expect(group.scaleVector.y).toBe(1);
    expect(group.scaleVector.z).toBe(1);

    const sourceBounds = circle.getBounds();
    target.normalizeTransform();
    const targetChild = target.children[0] as Circle;
    const targetBounds = targetChild.getBounds();

    expect(sourceBounds.min.x).toBeCloseTo(targetBounds.min.x, 6);
    expect(sourceBounds.max.x).toBeCloseTo(targetBounds.max.x, 6);
    expect(sourceBounds.min.y).toBeCloseTo(targetBounds.min.y, 6);
    expect(sourceBounds.max.y).toBeCloseTo(targetBounds.max.y, 6);
  });

  it('finish sets children to target state (points and style)', () => {
    const circle = new Circle({ radius: 1, color: '#ff0000', strokeWidth: 2 });
    circle.fillOpacity = 0.3;
    const group = new VGroup(circle);

    const targetCircle = new Circle({ radius: 2, color: '#0000ff', strokeWidth: 4 });
    targetCircle.fillOpacity = 0.8;
    const target = new VGroup(targetCircle);

    const t = new Transform(group, target);
    t.begin();
    t.finish();

    // Points should match target
    const childPts = circle.getLocalPoints();
    const targetPts = targetCircle.getLocalPoints();
    expect(childPts.length).toBe(targetPts.length);

    // Style should match target
    expect(circle.color).toBe(targetCircle.color);
    expect(circle.strokeWidth).toBe(targetCircle.strokeWidth);
    expect(circle.fillOpacity).toBeCloseTo(0.8, 5);
  });

  it('handles VGroup with multiple children', () => {
    const c1 = new Circle({ radius: 1 });
    const c2 = new Circle({ radius: 0.5 });
    c2.shift([2, 0, 0]);
    const group = new VGroup(c1, c2);

    const target = group.copy() as VGroup;
    target.scale(2);

    const t = new Transform(group, target);
    expect(() => {
      t.begin();
      t.interpolate(0.5);
      t.finish();
    }).not.toThrow();
  });

  it('splits an existing child into a real duplicate when target has more (Manim CE add_n_more_submobjects)', () => {
    const c1 = new Circle({ radius: 1 });
    const group = new VGroup(c1);

    const tc1 = new Circle({ radius: 1 });
    const tc2 = new Circle({ radius: 0.5 });
    tc2.shift([2, 0, 0]);
    const target = new VGroup(tc1, tc2);

    const t = new Transform(group, target);
    t.begin();

    // Source group should now have a real duplicate of c1 for the extra target.
    expect(group.children.length).toBe(2);
    const duplicate = group.children[1] as VMobject;
    expect(duplicate).not.toBe(c1);

    // The duplicate starts as a full, visible copy of its sibling (c1's
    // radius-1 geometry) -- never an invisible placeholder.
    t.interpolate(0);
    expect(duplicate.opacity).toBeCloseTo(c1.opacity, 5);
    expect(duplicate.getBoundingBox().width).toBeCloseTo(2, 3); // radius-1 circle

    // By alpha=1 it has morphed for real into tc2's shape/position.
    t.interpolate(1);
    expect(duplicate.getBoundingBox().width).toBeCloseTo(1, 3); // radius-0.5 circle
    expect(duplicate.getCenter()[0]).toBeCloseTo(2, 3);
  });

  it('merges an extra source child into a duplicated target when source has more (Manim CE add_n_more_submobjects)', () => {
    const c1 = new Circle({ radius: 1 });
    const c2 = new Circle({ radius: 0.5 });
    const group = new VGroup(c1, c2);

    const tc1 = new Circle({ radius: 2 });
    const target = new VGroup(tc1);

    const t = new Transform(group, target);
    t.begin();
    t.interpolate(1);

    // Extra source child morphs for real into a duplicate of tc1 (Manim CE's
    // "merging" behavior) instead of fading to invisible.
    expect(c2.opacity).toBeCloseTo(tc1.opacity, 5);
    expect(c2.fillOpacity).toBeCloseTo(tc1.fillOpacity, 5);
    expect(c2.getBoundingBox().width).toBeCloseTo(4, 3); // radius-2 circle
    expect(c2.getCenter()[0]).toBeCloseTo(tc1.getCenter()[0], 3);
  });

  it('interpolate at alpha=0 preserves start state', () => {
    const circle = new Circle({ radius: 1 });
    const group = new VGroup(circle);

    const target = group.copy() as VGroup;
    target.scale(2);

    const t = new Transform(group, target);
    t.begin();

    const startPts = circle.getLocalPoints().map((p) => [...p]);
    t.interpolate(0);
    const pts = circle.getLocalPoints();

    for (let i = 0; i < Math.min(startPts.length, pts.length); i++) {
      expect(pts[i][0]).toBeCloseTo(startPts[i][0], 3);
      expect(pts[i][1]).toBeCloseTo(startPts[i][1], 3);
    }
  });

  describe('transform sequencing', () => {
    it('supports chained transforms a->b then b->c on the same source', () => {
      const a = new Circle({ radius: 1, color: '#ff0000' });
      a.shift([-2, 0, 0]);
      const b = new Circle({ radius: 1.5, color: '#00ff00' });
      b.shift([1, 2, 0]);
      b.opacity = 0.6;
      const c = new Circle({ radius: 0.75, color: '#0000ff' });
      c.shift([4, -1, 0]);
      c.opacity = 0.25;

      const ab = new Transform(a, b);
      ab.begin();
      ab.interpolate(1);
      ab.finish();

      const bc = new Transform(a, c);
      bc.begin();
      bc.interpolate(1);
      bc.finish();

      expect(a.position.x).toBeCloseTo(c.position.x, 5);
      expect(a.position.y).toBeCloseTo(c.position.y, 5);
      expect(a.opacity).toBeCloseTo(c.opacity, 5);
      expect(a.color).toBe(c.color);
    });

    it('supports fan-out from identical a seeds: a->b and a->c', () => {
      const seed = new Circle({ radius: 1, color: '#ffaa00' });
      seed.shift([-1, -1, 0]);
      seed.opacity = 0.9;

      const sourceForB = seed.copy() as Circle;
      const sourceForC = seed.copy() as Circle;

      const b = new Circle({ radius: 2, color: '#00aaff' });
      b.shift([3, 0, 0]);
      b.opacity = 0.5;

      const c = new Circle({ radius: 0.5, color: '#aa00ff' });
      c.shift([0, 3, 0]);
      c.opacity = 0.2;

      const aToB = new Transform(sourceForB, b);
      aToB.begin();
      aToB.interpolate(1);
      aToB.finish();

      const aToC = new Transform(sourceForC, c);
      aToC.begin();
      aToC.interpolate(1);
      aToC.finish();

      const centerB = sourceForB.getCenter();
      const centerTargetB = b.getCenter();
      const centerC = sourceForC.getCenter();
      const centerTargetC = c.getCenter();

      expect(centerB[0]).toBeCloseTo(centerTargetB[0], 5);
      expect(centerB[1]).toBeCloseTo(centerTargetB[1], 5);
      expect(sourceForB.color).toBe(b.color);

      expect(centerC[0]).toBeCloseTo(centerTargetC[0], 5);
      expect(centerC[1]).toBeCloseTo(centerTargetC[1], 5);
      expect(sourceForC.color).toBe(c.color);

      expect(centerB[0]).not.toBeCloseTo(centerC[0], 5);
      expect(centerB[1]).not.toBeCloseTo(centerC[1], 5);
    });
  });
});

describe('Transform on non-VGroup leaf-delegating VMobjects (issue #545)', () => {
  // Regression for: Transform silently fell back to FadeMorphStrategy for any
  // VMobject whose geometry is carried entirely by its children (own points
  // cleared) unless that VMobject also happened to be a VGroup. DashedLine
  // and a multi-component RegularPolygram both hit this — neither is a
  // VGroup, and neither has non-empty getLocalPoints() on itself.

  describe('DashedLine (own points empty, geometry in Line children)', () => {
    it('is not itself a VGroup, and owns no points directly', () => {
      const dashed = new DashedLine({ start: [-1, 0, 0], end: [1, 0, 0], dashLength: 0.2 });
      expect(dashed).not.toBeInstanceOf(VGroup);
      expect(dashed.hasOwnPoints()).toBe(false);
      expect(dashed.getLocalPoints()).toEqual([]);
      expect(dashed.getDashes().length).toBeGreaterThan(0);
    });

    it('selects PointMorphStrategy, not FadeMorphStrategy', () => {
      const source = new DashedLine({ start: [-1, 0, 0], end: [1, 0, 0], dashLength: 0.2 });
      const target = new DashedLine({ start: [-2, 1, 0], end: [2, 1, 0], dashLength: 0.2 });

      const t = new Transform(source, target);
      t.begin();

      const strategy = (t as unknown as { _strategy: unknown })._strategy;
      expect(strategy).toBeInstanceOf(PointMorphStrategy);
      expect(strategy).not.toBeInstanceOf(FadeMorphStrategy);
    });

    it('interpolates each dash geometrically instead of cross-fading the whole line', () => {
      const source = new DashedLine({ start: [-1, 0, 0], end: [1, 0, 0], dashLength: 0.2 });
      const target = new DashedLine({ start: [-1, 4, 0], end: [1, 4, 0], dashLength: 0.2 });

      const firstDashStartY = source.getDashes()[0].getLocalPoints()[0][1];
      expect(firstDashStartY).toBeCloseTo(0, 5);

      const t = new Transform(source, target);
      t.begin();

      // A real geometric morph moves each dash continuously; a cross-fade
      // would leave positions untouched and only animate opacity.
      t.interpolate(0.5);
      const midY = source.getDashes()[0].getLocalPoints()[0][1];
      expect(midY).toBeCloseTo(2, 1);
      expect(source.getDashes()[0].opacity).toBeCloseTo(1, 5);

      t.interpolate(1);
      t.finish();
      const finalY = source.getDashes()[0].getLocalPoints()[0][1];
      expect(finalY).toBeCloseTo(4, 1);
    });

    it('handles a source/target pair with a different number of dashes without throwing', () => {
      const source = new DashedLine({ start: [-1, 0, 0], end: [1, 0, 0], dashLength: 0.5 });
      const target = new DashedLine({ start: [-1, 0, 0], end: [1, 0, 0], dashLength: 0.1 });
      expect(source.getDashes().length).not.toBe(target.getDashes().length);

      const t = new Transform(source, target);
      expect(() => {
        t.begin();
        t.interpolate(0.5);
        t.interpolate(1);
        t.finish();
      }).not.toThrow();
    });
  });

  describe('RegularPolygram with gcd(n,k) > 1 (own points empty, geometry in VMobject children)', () => {
    it('is not a VGroup, and owns no points directly once it has multiple components', () => {
      // {6/2} decomposes into gcd(6,2)=2 triangle components, stored as children.
      const hexagram = new RegularPolygram({ numVertices: 6, density: 2 });
      expect(hexagram).not.toBeInstanceOf(VGroup);
      expect(hexagram.hasOwnPoints()).toBe(false);
      expect(hexagram.children.length).toBe(2);
    });

    it('selects PointMorphStrategy, not FadeMorphStrategy, for two multi-component polygrams', () => {
      const source = new RegularPolygram({ numVertices: 6, density: 2, radius: 1 });
      const target = new RegularPolygram({ numVertices: 6, density: 2, radius: 2 });

      const t = new Transform(source, target);
      t.begin();

      const strategy = (t as unknown as { _strategy: unknown })._strategy;
      expect(strategy).toBeInstanceOf(PointMorphStrategy);
      expect(strategy).not.toBeInstanceOf(FadeMorphStrategy);
    });
  });
});

function makeTextCanvasMock() {
  return {
    font: '',
    textBaseline: '',
    textAlign: 'center' as const,
    fillStyle: '',
    strokeStyle: '',
    globalAlpha: 1,
    lineWidth: 0,
    measureText: (_text: string) => ({ width: 100 }),
    clearRect: () => {},
    fillText: () => {},
    strokeText: () => {},
  };
}

describe('Shape morph non-regression', () => {
  it('keeps unit-geometry morph setup stable against _syncToThree geometry restores', () => {
    const source = new SyncingTexturedMobject(1, 0.5);
    const target = new SyncingTexturedMobject(2, 1);
    const strategy = new ShapeMorphStrategy();

    strategy.begin({} as never, source, target);

    const sourceMesh = source.getDisplayMeshes()[0];
    const sourceGeom = sourceMesh.geometry as THREE.PlaneGeometry;
    expect(sourceGeom.parameters.width).toBeCloseTo(1, 5);
    expect(sourceGeom.parameters.height).toBeCloseTo(1, 5);

    // Simulate runtime sync right after begin() (this previously reverted geometry).
    source._syncToThree();

    const sourceGeomAfterSync = sourceMesh.geometry as THREE.PlaneGeometry;
    expect(sourceGeomAfterSync.parameters.width).toBeCloseTo(1, 5);
    expect(sourceGeomAfterSync.parameters.height).toBeCloseTo(1, 5);

    strategy.interpolate({} as never, source, target, 0);
    expect(sourceMesh.scale.x).toBeCloseTo(1, 5);
    expect(sourceMesh.scale.y).toBeCloseTo(0.5, 5);
  });
});

describe('Text Transform (#305)', () => {
  it('getText() returns target text after Transform finish', () => {
    const mockCtx = makeTextCanvasMock();
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tagName: string): HTMLElement => {
        const el = originalCreateElement(tagName);
        if (tagName.toLowerCase() === 'canvas') {
          (el as HTMLCanvasElement).getContext = ((contextType: string) =>
            contextType === '2d' ? mockCtx : null) as HTMLCanvasElement['getContext'];
        }
        return el;
      });

    try {
      const t1 = new Text({ text: 'A' });
      const t2 = new Text({ text: 'B' });
      const tr = new Transform(t1, t2);
      tr.begin();
      tr.interpolate(0.5);
      tr.finish();

      expect(t1.getText()).toBe('B');
    } finally {
      createElementSpy.mockRestore();
    }
  });

  it('getText() stays as target text after subsequent _markDirty + _syncToThree (#305)', () => {
    const mockCtx = makeTextCanvasMock();
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tagName: string): HTMLElement => {
        const el = originalCreateElement(tagName);
        if (tagName.toLowerCase() === 'canvas') {
          (el as HTMLCanvasElement).getContext = ((contextType: string) =>
            contextType === '2d' ? mockCtx : null) as HTMLCanvasElement['getContext'];
        }
        return el;
      });

    try {
      const t1 = new Text({ text: 'A' });
      const t2 = new Text({ text: 'B' });
      const tr = new Transform(t1, t2);
      tr.begin();
      tr.interpolate(0.5);
      tr.finish();

      expect(t1.getText()).toBe('B');

      // A subsequent sync cycle must not revert getText() to source text
      t1._markDirty();
      t1._syncToThree();
      expect(t1.getText()).toBe('B');
    } finally {
      createElementSpy.mockRestore();
    }
  });

  describe('PMobject point-cloud transforms', () => {
    it('selects PointCloudMorphStrategy for PMobject→PMobject (not fade)', () => {
      const src = new PMobject({ points: [{ position: [-2, 0, 0] }] });
      const tgt = new PMobject({ points: [{ position: [2, 0, 0] }] });
      const t = new Transform(src, tgt);
      t.begin();
      const strategy = (t as unknown as { _strategy: unknown })._strategy;
      expect(strategy).toBeInstanceOf(PointCloudMorphStrategy);
    });

    it('interpolates a single point from x=-2 to x=+2', () => {
      const src = new PMobject({ points: [{ position: [-2, 0, 0] }] });
      const tgt = new PMobject({ points: [{ position: [2, 0, 0] }] });
      const t = new Transform(src, tgt);
      t.begin();

      t.interpolate(0);
      expect(src.getLocalPoints()[0].position[0]).toBeCloseTo(-2, 5);

      t.interpolate(0.5);
      expect(src.getLocalPoints()[0].position[0]).toBeCloseTo(0, 5);

      t.interpolate(1);
      expect(src.getLocalPoints()[0].position[0]).toBeCloseTo(2, 5);

      t.finish();
      expect(src.getLocalPoints()[0].position[0]).toBeCloseTo(2, 5);
    });

    it('interpolates per-point color and opacity', () => {
      const src = new PMobject({ points: [{ position: [0, 0, 0], color: '#000000', opacity: 0 }] });
      const tgt = new PMobject({ points: [{ position: [0, 0, 0], color: '#ffffff', opacity: 1 }] });
      const t = new Transform(src, tgt);
      t.begin();
      t.interpolate(0.5);
      const p = src.getLocalPoints()[0];
      expect(p.opacity).toBeCloseTo(0.5, 5);
      // Halfway between black and white lands at mid-grey, not either endpoint.
      const c = new THREE.Color(p.color);
      expect(c.r).toBeGreaterThan(0.1);
      expect(c.r).toBeLessThan(0.9);
    });

    it('pads point-count mismatch so both clouds stay aligned', () => {
      const src = new PMobject({ points: [{ position: [0, 0, 0] }] });
      const tgt = new PMobject({
        points: [{ position: [1, 0, 0] }, { position: [2, 0, 0] }, { position: [3, 0, 0] }],
      });
      const t = new Transform(src, tgt);
      t.begin();
      // Source padded up to 3 points to match target.
      expect(src.getLocalPoints().length).toBe(3);
      t.finish();
      // Finishes at the target's real geometry.
      expect(src.getLocalPoints().length).toBe(3);
      expect(src.getLocalPoints().map((p) => p.position[0])).toEqual([1, 2, 3]);
    });
  });
});
