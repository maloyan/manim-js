import { describe, it, expect, vi } from 'vitest';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { Scene } from './Scene';
import { ThreeDScene } from './ThreeDScene';
import { Circle } from '../mobjects/geometry/Circle';
import { Square } from '../mobjects/geometry/Rectangle';
import { DashedLine } from '../mobjects/geometry/DashedLine';
import { Create } from '../animation/creation/Create';
import { FadeIn } from '../animation/fading/FadeIn';

/**
 * Regression tests for issue #317:
 * `scene.add(x); scene.play(Create(x))` must not render `x` at full opacity
 * for one frame before the animation begins. `add()` is state-only and
 * defers its auto-render via microtask; `play()` and `wait()` suppress that
 * deferred render while they set up the animation.
 */

const flushMicrotasks = () => new Promise<void>((r) => queueMicrotask(r));

type SceneInternals = {
  _render: () => void;
  _pendingRender: boolean;
  _suppressAutoRender: boolean;
};

describe('Scene.add() defers auto-render (issue #317)', () => {
  it('add() schedules a render via microtask, does not render synchronously', async () => {
    const scene = Scene.createHeadless();
    const renderSpy = vi.spyOn(scene as unknown as SceneInternals, '_render');
    // Constructor calls _render() once; reset before the test action.
    renderSpy.mockClear();

    scene.add(new Circle());

    // No synchronous render yet — only a queued microtask.
    expect(renderSpy).not.toHaveBeenCalled();

    await flushMicrotasks();
    expect(renderSpy).toHaveBeenCalledTimes(1);

    scene.dispose();
  });

  it('multiple add() calls within a tick coalesce into a single render', async () => {
    const scene = Scene.createHeadless();
    const renderSpy = vi.spyOn(scene as unknown as SceneInternals, '_render');
    renderSpy.mockClear();

    scene.add(new Circle());
    scene.add(new Square());
    scene.add(new Circle());

    expect(renderSpy).not.toHaveBeenCalled();
    await flushMicrotasks();
    expect(renderSpy).toHaveBeenCalledTimes(1);

    scene.dispose();
  });

  it('play() after add() suppresses the pending render (no pre-animation flash)', async () => {
    const scene = Scene.createHeadless();
    const circle = new Circle();
    const renderSpy = vi.spyOn(scene as unknown as SceneInternals, '_render');
    renderSpy.mockClear();

    scene.add(circle);
    // Synchronously start play() before the queued add-render microtask runs.
    const playPromise = scene.play(new Create(circle, { duration: 0.05 }));

    // The pending render flag must be cleared once play() begins its setup.
    expect((scene as unknown as SceneInternals)._pendingRender).toBe(false);

    await playPromise;

    // We don't pin the exact frame count (varies with timer), but we do
    // require that begin() ran with `_render()` not yet called from add().
    // Any render that happened was driven by the render loop, after begin().
    scene.dispose();
  });

  it('wait() cancels the add() pending render', async () => {
    const scene = Scene.createHeadless();
    scene.add(new Circle());
    expect((scene as unknown as SceneInternals)._pendingRender).toBe(true);

    const waitPromise = scene.wait(0.01);
    expect((scene as unknown as SceneInternals)._pendingRender).toBe(false);
    await waitPromise;

    scene.dispose();
  });

  it('add() with no follow-up play still renders (backward compatible)', async () => {
    const scene = Scene.createHeadless();
    const renderSpy = vi.spyOn(scene as unknown as SceneInternals, '_render');
    renderSpy.mockClear();

    scene.add(new Circle());
    await flushMicrotasks();

    expect(renderSpy).toHaveBeenCalled();
    scene.dispose();
  });

  it('add() with autoRender=false does not schedule a render', async () => {
    const scene = Scene.createHeadless({ autoRender: false } as never);
    const renderSpy = vi.spyOn(scene as unknown as SceneInternals, '_render');
    renderSpy.mockClear();

    scene.add(new Circle());
    await flushMicrotasks();

    expect(renderSpy).not.toHaveBeenCalled();
    scene.dispose();
  });

  it('ThreeDScene.add() also defers its render (#317)', async () => {
    const scene = ThreeDScene.createHeadless();
    const renderSpy = vi.spyOn(scene as unknown as SceneInternals, '_render');
    renderSpy.mockClear();

    scene.add(new Circle());
    expect(renderSpy).not.toHaveBeenCalled();

    await flushMicrotasks();
    expect(renderSpy).toHaveBeenCalled();
    scene.dispose();
  });

  it('addForegroundMobject() defers its render and is suppressed by play() (#317)', async () => {
    const scene = Scene.createHeadless();
    const circle = new Circle();
    const renderSpy = vi.spyOn(scene as unknown as SceneInternals, '_render');
    renderSpy.mockClear();

    scene.addForegroundMobject(circle);
    expect(renderSpy).not.toHaveBeenCalled();

    const playPromise = scene.play(new Create(circle, { duration: 0.05 }));
    expect((scene as unknown as SceneInternals)._pendingRender).toBe(false);

    await playPromise;
    scene.dispose();
  });

  it('FadeIn after add() does not flash the mobject visible (#317)', async () => {
    const scene = Scene.createHeadless();
    const circle = new Circle();
    const renderSpy = vi.spyOn(scene as unknown as SceneInternals, '_render');
    renderSpy.mockClear();

    scene.add(circle);
    const playPromise = scene.play(new FadeIn(circle, { duration: 0.05 }));

    // No render fired between add() and play() entering its setup phase.
    expect(renderSpy).not.toHaveBeenCalled();

    await playPromise;
    scene.dispose();
  });
});

/**
 * Regression: Scene.add() used to call mobject.getThreeObject() (the first
 * Three.js sync, which computes VMobject stroke linewidth/resolution) BEFORE
 * _setSceneContextRecursive(mobject) set this scene's real, aspect-corrected
 * frameWidth. That first sync fell back to the class-level static default
 * (frameWidth=14), producing a wrong linewidth that would only ever get
 * corrected by accident (e.g. if some later, unrelated mutation happened to
 * re-dirty and resync the mobject) -- or never, for a mobject that's simply
 * added and left alone.
 */
describe('Scene.add() sets per-instance scene context before the first Three.js sync', () => {
  function firstLine2(mob: { getThreeObject(): import('three').Object3D }): Line2 {
    let found: Line2 | null = null;
    mob.getThreeObject().traverse((c) => {
      if (!found && c instanceof Line2) found = c;
    });
    if (!found) throw new Error("expected a Line2 in this mobject's Three.js subtree");
    return found;
  }

  // 800x450 gives frameWidth = 8 * (800/450) = 14.222..., deliberately
  // different from the class-level static default of 14 -- any ordering
  // regression in Scene.add() would show up as a linewidth mismatch here.
  const RENDERER_WIDTH = 800;
  const RENDERER_HEIGHT = 450;
  const CORRECT_FRAME_WIDTH = 8 * (RENDERER_WIDTH / RENDERER_HEIGHT);
  const STALE_FRAME_WIDTH = 14;

  function expectedLinewidth(strokeWidth: number): number {
    return strokeWidth * 0.01 * (RENDERER_WIDTH / CORRECT_FRAME_WIDTH);
  }
  function staleLinewidth(strokeWidth: number): number {
    return strokeWidth * 0.01 * (RENDERER_WIDTH / STALE_FRAME_WIDTH);
  }

  it('computes the correct aspect-corrected linewidth on the very first sync -- no animation or copy() needed to fix it up', () => {
    const scene = Scene.createHeadless({ width: RENDERER_WIDTH, height: RENDERER_HEIGHT });
    const circle = new Circle({ radius: 1, strokeWidth: 6 });

    scene.add(circle);

    const material = firstLine2(circle).material as unknown as { linewidth: number };
    expect(material.linewidth).toBeCloseTo(expectedLinewidth(6), 6);
    // Must NOT be the stale value the old (buggy) ordering produced.
    expect(material.linewidth).not.toBeCloseTo(staleLinewidth(6), 3);

    scene.dispose();
  });

  it('propagates the correct context to every descendant of a freshly-added container on the first sync', () => {
    const scene = Scene.createHeadless({ width: RENDERER_WIDTH, height: RENDERER_HEIGHT });
    const dashed = new DashedLine({
      start: [-3, -1.5, 0],
      end: [3, -1.5, 0],
      dashLength: 0.25,
      strokeWidth: 6,
    });

    scene.add(dashed);

    for (const dash of dashed.getDashes()) {
      const material = firstLine2(dash).material as unknown as { linewidth: number };
      expect(material.linewidth).toBeCloseTo(expectedLinewidth(6), 6);
    }

    scene.dispose();
  });

  it('ThreeDScene.add() also sets context before the first sync', () => {
    const scene = ThreeDScene.createHeadless({ width: RENDERER_WIDTH, height: RENDERER_HEIGHT });
    const circle = new Circle({ radius: 1, strokeWidth: 6 });

    scene.add(circle);

    const material = firstLine2(circle).material as unknown as { linewidth: number };
    expect(material.linewidth).not.toBeCloseTo(staleLinewidth(6), 3);

    scene.dispose();
  });
});
