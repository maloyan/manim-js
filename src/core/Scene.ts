import * as THREE from 'three';
import { Renderer, RendererOptions, IRenderer } from './Renderer';
import { NullRenderer } from './NullRenderer';
import { Camera2D, CameraOptions } from './Camera';
import { Mobject } from './Mobject';
import { Animation } from '../animation/Animation';
import { AnimationGroup } from '../animation/AnimationGroup';
import { Timeline } from '../animation/Timeline';
import { MANIM_BACKGROUND } from '../constants/colors';
import { VMobject } from './VMobject';
import { SceneStateManager, SceneSnapshot } from './StateManager';
import { AudioManager, type AddSoundOptions, type AudioTrack } from './AudioManager';
import { ensureAnimateProxyRegistered } from './AnimateProxy';
import type { MultiCamera } from './CameraExtensions';
import { logger } from '../utils/logger';

// AnimateProxy self-registers with Mobject via a top-level side effect
// (see AnimateProxy.ts) to avoid the Mobject -> AnimateProxy -> Transform ->
// VGroup -> Mobject cycle. Touching the export here forces module evaluation
// so `mobject.animate` works even when callers import Scene without ever
// referencing AnimateProxy directly (e.g. Scene.createHeadless() in tests).
ensureAnimateProxyRegistered();

/**
 * Options for scene.export() convenience method.
 * Format is inferred from the filename extension.
 */
export interface SceneExportOptions {
  /** Frames per second. Defaults to 30 for GIF, 60 for video. */
  fps?: number;
  /** Quality. For GIF: 1-30 (lower is better), default 10. For video: 0-1, default 0.9. */
  quality?: number;
  /** Output width in pixels. Defaults to scene width. */
  width?: number;
  /** Output height in pixels. Defaults to scene height. */
  height?: number;
  /** Duration in seconds. Auto-detects from timeline if not specified. */
  duration?: number;
  /** Progress callback (0-1). */
  onProgress?: (progress: number) => void;
  /** Include audio in video export. Defaults to true when audio tracks exist. */
  includeAudio?: boolean;
  /** GIF repeat mode. 0 = loop forever, -1 = no repeat. Default 0. */
  repeat?: number;
  /** Number of GIF encoding workers. Default 4. */
  workers?: number;
}

/**
 * Options for configuring a Scene.
 */
export interface SceneOptions {
  /** Canvas width in pixels. Defaults to container width. */
  width?: number;
  /** Canvas height in pixels. Defaults to container height. */
  height?: number;
  /** Background color as CSS color string. Defaults to Manim's dark gray (#1C1C1C). */
  backgroundColor?: string;
  /** Frame width in world units. Defaults to 14 (Manim standard). */
  frameWidth?: number;
  /** Frame height in world units. Defaults to 8 (Manim standard). */
  frameHeight?: number;
  /** Target frame rate in fps. Defaults to 60. */
  targetFps?: number;
  /** Enable frustum culling optimization. Defaults to true. */
  frustumCulling?: boolean;
  /** Enable auto-render on add/remove. Defaults to true. */
  autoRender?: boolean;
  /** Background opacity (0 = fully transparent, 1 = fully opaque). Defaults to 1. Not supported when exporting to video or GIF formats. */
  backgroundOpacity?: number;
  /** Enable headless mode (no WebGL renderer). Useful for testing scene logic without a DOM. */
  headless?: boolean;
  /**
   * Automatically resize the canvas when its container (or the window, on
   * mobile rotation) changes size. Only active when both `width` and `height`
   * are omitted — passing either dimension is treated as a request for a
   * pinned canvas size, so auto-resize stays off. Defaults to true.
   */
  autoResize?: boolean;
}

/**
 * Scene orchestrator for manimweb.
 * Manages the renderer, camera, mobjects, and animation playback.
 * Works like Manim's Scene class - add mobjects, play animations.
 */
export class Scene {
  private _renderer: IRenderer;
  private _camera: Camera2D;
  private _threeScene: THREE.Scene;
  private _mobjects: Set<Mobject>;
  private _timeline: Timeline | null = null;
  private _isPlaying: boolean = false;
  private _currentTime: number = 0;
  private _animationFrameId: number | null = null;
  private _backgroundTimerId: ReturnType<typeof setInterval> | null = null;
  private _lastFrameTime: number = 0;
  private _playPromiseResolve: (() => void) | null = null;
  protected _disposed: boolean = false;
  protected _waitCleanups: Array<() => void> = [];

  // Performance optimization: frame rate control
  private _targetFps: number = 60;
  private _targetFrameTime: number = 1000 / 60;

  // Performance optimization: frustum culling
  private _frustumCulling: boolean = true;
  private _frustum: THREE.Frustum = new THREE.Frustum();
  private _projScreenMatrix: THREE.Matrix4 = new THREE.Matrix4();

  // Performance optimization: object pooling for temporary vectors
  private static _tempBox3: THREE.Box3 = new THREE.Box3();

  // Performance optimization: auto-render control
  protected _autoRender: boolean = true;

  // Deferred auto-render: `add()` schedules a render via microtask instead of
  // rendering eagerly, so a subsequent `play()` can suppress it and avoid a
  // visible flash of the pre-animation state. See issue #317.
  private _pendingRender: boolean = false;
  // When true, scheduled renders are suppressed and no microtask is queued.
  // Set by `play()`/`wait()` during their setup phase.
  private _suppressAutoRender: boolean = false;

  // Z-ordering: assign increasing renderOrder to each added mobject
  private _renderOrderCounter: number = 0;

  // State management (undo/redo)
  private _stateManager: SceneStateManager;

  // Audio manager (lazy – created on first access)
  private _audioManager: AudioManager | null = null;

  // Optional multi-camera renderer. When set, `_render()` delegates to it
  // instead of the single-camera path. Default-camera object stays alive
  // for API compatibility and as a fallback when this is cleared.
  private _multiCamera: MultiCamera | null = null;

  // Auto-resize: ResizeObserver on container + window listeners (orientationchange
  // fallback for mobile browsers where ResizeObserver lags behind rotation).
  // Listeners are coalesced via requestAnimationFrame to fire at most once per
  // frame. Detached in `dispose()`.
  private _container: HTMLElement | null = null;
  private _resizeObserver: ResizeObserver | null = null;
  private _resizeRafId: number | null = null;
  private _onWindowResize: (() => void) | null = null;

  /**
   * Create a new Scene.
   * @param container - DOM element to render into, or null for headless mode
   * @param options - Scene configuration options
   */
  constructor(container: HTMLElement | null, options: SceneOptions = {}) {
    const {
      width,
      height,
      backgroundColor = MANIM_BACKGROUND,
      frameWidth = 14,
      frameHeight = 8,
      targetFps = 60,
      frustumCulling = true,
      autoRender = true,
      backgroundOpacity = 1,
      headless = false,
      autoResize = true,
    } = options;

    // Initialize performance options
    this._targetFps = targetFps;
    this._targetFrameTime = 1000 / targetFps;
    this._frustumCulling = frustumCulling;
    this._autoRender = autoRender;

    // Create Three.js scene
    this._threeScene = new THREE.Scene();

    // Create renderer
    if (headless) {
      this._renderer = new NullRenderer({
        width: width ?? 800,
        height: height ?? 450,
        backgroundColor,
        backgroundOpacity,
      });
    } else {
      if (!container) {
        throw new Error(
          'container is required for non-headless Scene. Use { headless: true } to create a scene without a DOM container.',
        );
      }
      const rendererOptions: RendererOptions = {
        width,
        height,
        backgroundColor,
        backgroundOpacity,
        antialias: true,
      };
      this._renderer = new Renderer(container, rendererOptions);
      this._container = container;
    }

    // Create camera with Manim-style frame dimensions
    const cameraOptions: CameraOptions = {
      frameWidth,
      frameHeight,
      position: [0, 0, 10],
    };
    this._camera = new Camera2D(cameraOptions);

    // Adjust camera aspect ratio to match renderer
    const aspectRatio = this._renderer.width / this._renderer.height;
    this._camera.setAspectRatio(aspectRatio);

    // Set renderer dimensions for VMobject LineMaterial resolution
    VMobject._rendererWidth = this._renderer.width;
    VMobject._rendererHeight = this._renderer.height;
    VMobject._frameWidth = frameWidth;

    // Initialize mobjects set
    this._mobjects = new Set();

    // Initialize state manager (undo/redo)
    this._stateManager = new SceneStateManager(() => Array.from(this._mobjects));

    // Initial render
    this._render();

    // Install auto-resize observer. Only when neither width nor height was
    // pinned by the caller — explicit dimensions are treated as a fixed canvas.
    if (autoResize && !headless && this._container && width == null && height == null) {
      this._installAutoResize();
    }
  }

  /**
   * Get the Three.js scene.
   */
  get threeScene(): THREE.Scene {
    return this._threeScene;
  }

  /**
   * Get the camera.
   */
  get camera(): Camera2D {
    return this._camera;
  }

  /**
   * Get the renderer.
   */
  get renderer(): IRenderer {
    return this._renderer;
  }

  /**
   * Get the active MultiCamera, or null if single-camera rendering is in use.
   */
  get multiCamera(): MultiCamera | null {
    return this._multiCamera;
  }

  /**
   * Attach (or detach) a MultiCamera for split-screen, picture-in-picture, or
   * quad-view rendering. Pass `null` to revert to single-camera rendering.
   * Has no effect in headless mode (the NullRenderer cannot scissor viewports).
   * @param mc - MultiCamera instance, or null to restore the default render path
   * @returns this for chaining
   */
  useMultiCamera(mc: MultiCamera | null): this {
    this._multiCamera = mc;
    // When detaching, restore the default camera's aspect to the full canvas
    // in case a MultiCamera entry previously mutated it.
    if (mc === null) {
      const aspectRatio = this._renderer.width / this._renderer.height;
      this._camera.setAspectRatio(aspectRatio);
    }
    this._render();
    return this;
  }

  /**
   * Whether this scene is running in headless mode (no WebGL renderer).
   */
  get isHeadless(): boolean {
    return this._renderer instanceof NullRenderer;
  }

  /**
   * Create a headless Scene for testing without a DOM container.
   * @param options - Scene configuration options (headless is set automatically)
   * @returns A new headless Scene instance
   */
  static createHeadless(options: SceneOptions = {}): Scene {
    return new Scene(null, { ...options, headless: true });
  }

  /**
   * Get the current timeline.
   */
  get timeline(): Timeline | null {
    return this._timeline;
  }

  /**
   * Set the scene's playback timeline.
   * Used by Player to assign a MasterTimeline for integrated playback.
   * @internal
   */
  setTimeline(timeline: Timeline | null): void {
    this._timeline = timeline;
  }

  /**
   * Get whether animations are currently playing.
   */
  get isPlaying(): boolean {
    return this._isPlaying;
  }

  /**
   * Whether a render loop is active (play() or wait()).
   * Used by ThreeDScene to avoid duplicate orbit rAF loops.
   */
  protected get _hasActiveLoop(): boolean {
    return this._isPlaying || this._waitCleanups.length > 0;
  }

  /**
   * Whether a continuous render loop is currently driving frames every
   * tick: play(), or wait() with per-frame rendering (updaters present).
   * A static wait() (render-once + timeout) does NOT count — manual
   * renders are still needed there. Interaction helpers (e.g. Draggable)
   * use this to skip redundant renders.
   */
  get isRenderLoopActive(): boolean {
    return this._isPlaying || (this._hasActiveLoop && this._needsPerFrameRendering());
  }

  /**
   * Get the current playback time.
   */
  get currentTime(): number {
    return this._currentTime;
  }

  /**
   * Get all mobjects in the scene.
   */
  get mobjects(): ReadonlySet<Mobject> {
    return this._mobjects;
  }

  // ---------------------------------------------------------------------------
  // Audio
  // ---------------------------------------------------------------------------

  /**
   * Get the audio manager (lazily created on first access).
   * Use this to access lower-level audio controls.
   */
  get audioManager(): AudioManager {
    if (!this._audioManager) {
      this._audioManager = new AudioManager();
    }
    return this._audioManager;
  }

  /**
   * Add a sound to play at a specific time on the timeline.
   * Mirrors Python manim's `self.add_sound("file.wav", time_offset=0.5)`.
   *
   * @param url - URL of the audio file
   * @param options - Scheduling and playback options
   * @returns Promise resolving to the created AudioTrack
   *
   * @example
   * ```ts
   * await scene.addSound('/sounds/click.wav', { time: 0.5 });
   * await scene.addSound('/sounds/whoosh.wav');  // plays at time 0
   * ```
   */
  async addSound(url: string, options?: AddSoundOptions): Promise<AudioTrack> {
    return this.audioManager.addSound(url, options);
  }

  /**
   * Add a sound that starts when a given animation begins.
   *
   * @param animation - The animation to sync with
   * @param url - URL of the audio file
   * @param options - Additional options (timeOffset shifts relative to animation start)
   * @returns Promise resolving to the created AudioTrack
   *
   * @example
   * ```ts
   * const fadeIn = new FadeIn(circle);
   * await scene.addSoundAtAnimation(fadeIn, '/sounds/appear.wav');
   * await scene.play(fadeIn);
   * ```
   */
  async addSoundAtAnimation(
    animation: Animation,
    url: string,
    options?: Omit<AddSoundOptions, 'time'> & { timeOffset?: number },
  ): Promise<AudioTrack> {
    return this.audioManager.addSoundAtAnimation(animation, url, options);
  }

  /**
   * Add mobjects as foreground objects that render on top of everything.
   * Matches Manim Python's add_foreground_mobject().
   * @param mobjects - Mobjects to add in the foreground
   */
  addForegroundMobject(...mobjects: Mobject[]): this {
    for (const mobject of mobjects) {
      if (!this._mobjects.has(mobject)) {
        this.add(mobject);
      }
      // Set very high renderOrder so it draws on top
      const threeObj = mobject.getThreeObject();
      const fgRo = 10000 + this._renderOrderCounter++;
      threeObj.renderOrder = fgRo;
      threeObj.traverse((child) => {
        child.renderOrder = fgRo;
      });
    }
    // Deferred render so a chained `play()` can suppress it (issue #317).
    this._scheduleRender();
    return this;
  }

  /**
   * Add mobjects to the scene.
   * @param mobjects - Mobjects to add
   */
  add(...mobjects: Mobject[]): this {
    for (const mobject of mobjects) {
      if (!this._mobjects.has(mobject)) {
        this._mobjects.add(mobject);
        // Set per-instance renderer context for VMobjects (multi-scene support)
        // BEFORE the first getThreeObject() sync below. _setSceneContext()
        // only writes plain fields (no Three.js object needed), so this is
        // safe to do first — and it must go first: getThreeObject() triggers
        // VMobjectRendering._syncMaterialToThree(), which computes
        // linewidth/resolution from this context. Doing it after would leave
        // that first sync using the class-level static fallback (e.g.
        // frameWidth=14) instead of this scene's real, aspect-corrected
        // frameWidth, producing a wrong stroke width until something else
        // happens to re-dirty and resync the mobject later.
        this._setSceneContextRecursive(mobject);
        const threeObj = mobject.getThreeObject();
        const ro = this._renderOrderCounter++;
        threeObj.renderOrder = ro;
        // Propagate renderOrder to ALL children so THREE.js sorts meshes
        // correctly (Group renderOrder doesn't cascade to child meshes).
        // Also disable depth test so renderOrder controls draw order (2D scene).
        threeObj.traverse((child) => {
          child.renderOrder = ro;
          const mesh = child as THREE.Mesh;
          if (mesh.material) {
            if (Array.isArray(mesh.material)) {
              for (const m of mesh.material) m.depthTest = false;
            } else {
              mesh.material.depthTest = false;
            }
          }
        });
        // Only add to THREE scene root if not already in the scene graph
        // (prevents reparenting sub-objects like ZoomedDisplay.displayFrame)
        if (!this._isInSceneGraph(threeObj)) {
          this._threeScene.add(threeObj);
        }
        // If mobject or any descendant has pending async rendering (e.g. MathTex),
        // re-render when done. Recursively check children since MathTex objects
        // may be nested inside VGroup/Group containers.
        this._awaitAsyncRenders(mobject);
        mobject.createdAtBeginning = true;
      }
    }
    // Defer the auto-render via microtask so a chained `play()` can suppress
    // it and avoid a one-frame flash of the pre-animation state (issue #317).
    this._scheduleRender();
    return this;
  }

  /**
   * Remove mobjects from the scene.
   * @param mobjects - Mobjects to remove
   */
  remove(...mobjects: Mobject[]): this {
    for (const mobject of mobjects) {
      if (this._mobjects.has(mobject)) {
        this._mobjects.delete(mobject);
        const threeObj = mobject.getThreeObject();
        // Only remove from THREE scene root if it's a direct child
        // (sub-objects stay with their parent group)
        if (threeObj.parent === this._threeScene) {
          this._threeScene.remove(threeObj);
        }
      }
    }
    if (this._autoRender) {
      this._render();
    }
    return this;
  }

  /**
   * Recursively set per-instance scene context on a mobject and all its
   * VMobject children so that stroke-width calculations use this scene's
   * renderer dimensions instead of the class-level statics.
   */
  private _setSceneContextRecursive(mobject: Mobject): void {
    mobject._setSceneContext(this._renderer.width, this._renderer.height, this._camera.frameWidth);
    for (const child of mobject.children) {
      this._setSceneContextRecursive(child);
    }
  }

  /**
   * Check if a THREE object is already part of this scene's graph.
   * Protected so subclasses with additional render graphs (e.g.
   * ThreeDScene's HUD scene) can extend this check — otherwise `add()`
   * reparents objects that are already correctly placed elsewhere.
   */
  protected _isInSceneGraph(obj: THREE.Object3D): boolean {
    let current = obj.parent;
    while (current) {
      if (current === this._threeScene) return true;
      current = current.parent;
    }
    return false;
  }

  /**
   * Clear all mobjects from the scene.
   * @param options.render - Whether to auto-render after clearing. Default: true.
   *   Pass `false` to suppress the render (e.g., when rebuilding the scene
   *   immediately afterwards to avoid a blank-frame flicker).
   */
  clear({ render = true }: { render?: boolean } = {}): this {
    for (const mobject of this._mobjects) {
      const threeObj = mobject.getThreeObject();
      this._threeScene.remove(threeObj);
      mobject.dispose();
    }
    this._mobjects.clear();
    this._renderOrderCounter = 0;

    // Also remove any untracked Three.js objects (e.g., cross-fade targets
    // added directly by Transform animations)
    while (this._threeScene.children.length > 0) {
      this._threeScene.remove(this._threeScene.children[0]);
    }

    if (render && this._autoRender) {
      this._render();
    }
    return this;
  }

  /**
   * Recursively collect all leaf animations from animation groups.
   */
  private _collectAllAnimations(animations: Animation[]): Animation[] {
    const result: Animation[] = [];
    for (const anim of animations) {
      result.push(anim);
      if (anim instanceof AnimationGroup) {
        result.push(...this._collectAllAnimations(anim.animations));
      }
    }
    return result;
  }

  /**
   * Shared animation playback logic for play() and playWithTimestamps().
   * Handles async render waits, dirty sync, begin(), scene add, timeline setup,
   * and cleanup. The scheduleOnTimeline callback defines how animations are
   * scheduled on the timeline (parallel vs. timestamped).
   */
  private async _runAnimations(
    topLevelAnimations: Animation[],
    scheduleOnTimeline: (timeline: Timeline) => void,
  ): Promise<void> {
    const allAnimations = this._collectAllAnimations(topLevelAnimations);

    // Suppress any auto-render that `add()` (called by the user before play,
    // or by us below) might have scheduled. Otherwise the mobject would be
    // rendered at full opacity for one microtask before begin() hides it
    // (issue #317). Suppression is released once the render loop is running.
    this._cancelPendingRender();
    this._suppressAutoRender = true;
    try {
      // Wait for any async renders (e.g. SVG-based MathTex) to complete before
      // starting animations. Without this, Create/DrawBorderThenFill would
      // animate an empty mobject because SVG paths haven't loaded yet.
      const renderPromises: Promise<void>[] = [];
      const collectRenders = (mobject: Mobject) => {
        const asyncMob = mobject as Mobject & { waitForRender?: () => Promise<void> };
        if (typeof asyncMob.waitForRender === 'function') {
          renderPromises.push(asyncMob.waitForRender().catch(() => {}));
        }
        for (const child of mobject.children) {
          collectRenders(child);
        }
      };
      for (const anim of allAnimations) {
        collectRenders(anim.mobject);
      }
      if (renderPromises.length > 0) {
        await Promise.all(renderPromises);
      }

      // Force geometry sync so begin() can detect Line2 children for dash-reveal
      // animations (e.g. MathTex Create). This must happen before begin() but
      // we must NOT add to the scene yet — otherwise the mobject renders at full
      // opacity for one frame before begin() hides it.
      for (const animation of allAnimations) {
        if (animation.mobject._dirty) {
          animation.mobject._syncToThree();
          animation.mobject._dirty = false;
        }
      }

      // Initialize only top-level animations to avoid double begin() on AnimationGroup children
      for (const animation of topLevelAnimations) {
        animation.begin();
      }

      // Add animated mobjects to scene AFTER begin() so they appear in their
      // initial animation state (e.g. hidden for Create, zero opacity for FadeIn).
      for (const animation of allAnimations) {
        if (!this._mobjects.has(animation.mobject)) {
          this.add(animation.mobject);
        }
      }

      // Schedule animations on timeline via callback
      this._timeline = new Timeline();
      scheduleOnTimeline(this._timeline);

      // Start playback
      this._timeline.play();
      this._isPlaying = true;
      this._currentTime = 0;

      // Start audio playback if audio has been loaded
      if (this._audioManager) {
        this._audioManager.seek(0);
        this._audioManager.play();
      }

      // Start render loop if not already running
      this._startRenderLoop();
    } finally {
      // Render loop owns rendering from here on; release suppression so any
      // post-play `add()` (or async render resolution) renders normally.
      this._suppressAutoRender = false;
      this._cancelPendingRender();
    }

    // Wait for all animations to finish (or dispose cancels)
    if (this._disposed) return;
    await new Promise<void>((resolve) => {
      this._playPromiseResolve = resolve;
    });

    // Let each animation update scene membership (handles `remover`,
    // and overrides like ReplacementTransform that swap source for target).
    for (const animation of allAnimations) {
      animation.cleanUpFromScene(this);
    }
  }

  /**
   * Play animations in parallel (all at once).
   * Matches Manim's scene.play() behavior where multiple animations run simultaneously.
   * Automatically adds mobjects to the scene if not already present.
   * @param animations - Animations to play
   * @returns Promise that resolves when all animations complete
   */
  async play(...animations: Animation[]): Promise<void> {
    if (animations.length === 0) return;

    return this._runAnimations(animations, (timeline) => {
      timeline.addParallel(animations);
    });
  }

  /**
   * Play animations with explicit per-animation start/end times (seconds).
   *
   * NOTE: this is a manim-widget wire-format feature — Python manim has no
   * equivalent per-animation timing API. It is used by the player when
   * deserializing AnimationGroup descriptors that carry `start`/`end` fields.
   *
   * Each entry's `end - start` overrides the animation's own duration so the
   * Timeline schedules it for the correct window. WARNING: this permanently
   * mutates the Animation object's `duration` property. Reusing the same
   * animation instance in multiple calls will use the last set duration.
   */
  async playWithTimestamps(
    entries: { animation: Animation; start: number; end: number }[],
  ): Promise<void> {
    if (entries.length === 0) return;

    // Validate timestamps: finite, end > start, start >= 0
    for (const { start, end } of entries) {
      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        throw new Error(
          `Invalid animation timing: start and end must be finite (got start=${start}, end=${end})`,
        );
      }
      if (end <= start) {
        throw new Error(
          `Invalid animation timing: end (${end}) must be greater than start (${start})`,
        );
      }
      if (start < 0) {
        throw new Error(`Invalid animation timing: start (${start}) must be >= 0`);
      }
    }

    // Override animation durations BEFORE begin() so AnimationGroup can use
    // the new duration to compute child _startTimes/_endTimes correctly.
    for (const { animation, start, end } of entries) {
      Object.defineProperty(animation, 'duration', {
        value: end - start,
        writable: true,
        configurable: true,
      });
    }

    const animations = entries.map((e) => e.animation);

    return this._runAnimations(animations, (timeline) => {
      for (const { animation, start } of entries) {
        timeline.add(animation, start);
      }
    });
  }

  /**
   * Play multiple animations in parallel (all at once).
   * Alias for play() - delegates to play() to avoid duplicated logic.
   * @param animations - Animations to play simultaneously
   * @returns Promise that resolves when all animations complete
   */
  async playAll(...animations: Animation[]): Promise<void> {
    return this.play(...animations);
  }

  /**
   * Wait for a duration (pause between animations).
   * Runs a render loop during the wait so that updaters keep ticking.
   * @param duration - Duration in seconds
   * @returns Promise that resolves after the duration
   */
  async wait(duration: number = 1): Promise<void> {
    if (this._disposed) return;
    // wait() will render the initial frame itself (either once or via its
    // own rAF loop); drop any pending add()-scheduled render so we don't
    // render twice on entry.
    this._cancelPendingRender();
    return new Promise((resolve) => {
      const startTime = performance.now();
      let lastFrameTime = startTime;
      let rafId: number | null = null;
      let timerId: ReturnType<typeof setInterval> | null = null;
      let resolved = false;

      const cleanup = () => {
        if (resolved) return;
        resolved = true;
        if (rafId !== null) cancelAnimationFrame(rafId);
        if (timerId !== null) clearInterval(timerId);
        // Remove from active cleanups
        const idx = this._waitCleanups.indexOf(cleanup);
        if (idx >= 0) this._waitCleanups.splice(idx, 1);
        resolve();
      };

      // Register cleanup so dispose() can cancel this wait
      this._waitCleanups.push(cleanup);

      // If nothing needs per-frame rendering (no updaters, no camera animation),
      // render once and skip the rAF loop. This prevents 3D scenes from
      // running 60fps GPU rendering when the scene is static.
      if (!this._needsPerFrameRendering()) {
        this._render();
        if (duration > 86400) {
          // "Forever" wait (e.g. wait(999999)) — resolve only on dispose
          return;
        }
        timerId = setTimeout(() => {
          cleanup();
        }, duration * 1000) as unknown as ReturnType<typeof setInterval>;
        return;
      }

      const tick = (currentTime: number) => {
        if (resolved || this._disposed) {
          cleanup();
          return;
        }
        const elapsed = (currentTime - startTime) / 1000;
        if (elapsed >= duration) {
          // Final update at exactly the remaining dt
          const dt = (currentTime - lastFrameTime) / 1000;
          if (dt > 0) {
            for (const mobject of this._mobjects) {
              mobject.update(dt);
            }
            this._render();
          }
          cleanup();
          return;
        }

        const dt = (currentTime - lastFrameTime) / 1000;
        lastFrameTime = currentTime;

        // Update all mobjects (run updaters)
        for (const mobject of this._mobjects) {
          mobject.update(dt);
        }

        // Render frame
        this._render();
      };

      const loop = (currentTime: number) => {
        tick(currentTime);
        if (!resolved) {
          rafId = requestAnimationFrame(loop);
        }
      };

      rafId = requestAnimationFrame(loop);

      // Background-tab fallback: rAF is suspended when tab is hidden,
      // but setInterval still fires (~1Hz). This ensures wait() resolves
      // even when the tab is in the background.
      timerId = setInterval(() => {
        if (resolved) return;
        const now = performance.now();
        const elapsed = now - lastFrameTime;
        if (elapsed > 200) {
          tick(now);
        }
      }, 100);
    });
  }

  /**
   * Seek to a specific time in the timeline.
   * Also seeks the audio manager if audio has been used.
   * @param time - Time in seconds
   */
  seek(time: number): this {
    if (this._timeline) {
      this._timeline.seek(time);
      this._currentTime = time;
      this._render();
    }
    if (this._audioManager) {
      this._audioManager.seek(time);
    }
    return this;
  }

  /**
   * Pause playback (video and audio).
   */
  pause(): this {
    this._isPlaying = false;
    if (this._timeline) {
      this._timeline.pause();
    }
    if (this._audioManager) {
      this._audioManager.pause();
    }
    return this;
  }

  /**
   * Resume playback (video and audio).
   */
  resume(): this {
    if (this._timeline && !this._timeline.isFinished()) {
      this._isPlaying = true;
      this._timeline.play();
      this._startRenderLoop();
      if (this._audioManager) {
        this._audioManager.play();
      }
    }
    return this;
  }

  /**
   * Stop playback and reset timeline (video and audio).
   */
  stop(): this {
    this._isPlaying = false;
    this._currentTime = 0;
    if (this._timeline) {
      this._timeline.reset();
    }
    if (this._audioManager) {
      this._audioManager.stop();
    }
    this._stopRenderLoop();
    return this;
  }

  /**
   * Recursively find all descendant mobjects with waitForRender() and
   * trigger a scene re-render when each completes.
   *
   * Guards against already-resolved promises: if the mobject exposes an
   * `isRendering()` method and it returns false, the render has already
   * finished so we skip the callback to avoid redundant _render() calls
   * that can cause visible flicker.
   */
  private _awaitAsyncRenders(mobject: Mobject): void {
    const asyncMob = mobject as Mobject & {
      waitForRender?: () => Promise<void>;
      isRendering?: () => boolean;
    };
    if (typeof asyncMob.waitForRender === 'function') {
      // If the mobject exposes an isRendering() check and is no longer
      // rendering, the promise is already settled -- skip the callback
      // to avoid a redundant (and potentially flickering) re-render.
      const stillRendering = typeof asyncMob.isRendering !== 'function' || asyncMob.isRendering();

      if (stillRendering) {
        asyncMob
          .waitForRender()
          .then(() => {
            // Route through the scheduler so a play()/wait() in flight can
            // suppress this render and avoid a pre-animation flash (#317).
            this._scheduleRender();
          })
          .catch((err) => {
            // Log only a small identifier — sanitizing/stringifying a full
            // mobject graph for the logger would be expensive.
            logger.warn('Scene: async mobject render failed for', asyncMob.constructor.name, err);
          });
      }
    }
    for (const child of mobject.children) {
      this._awaitAsyncRenders(child);
    }
  }

  /**
   * Whether the scene needs per-frame rendering during wait().
   * Returns true if any mobject has updaters. Subclasses (e.g. ThreeDScene)
   * can override to also check for ambient camera rotation, etc.
   */
  protected _needsPerFrameRendering(): boolean {
    for (const mob of this._mobjects) {
      if (mob.hasUpdaters()) return true;
    }
    return false;
  }

  /**
   * Queue a render to run on the next microtask. Multiple calls within the
   * same tick coalesce. If `_cancelPendingRender()` is called or
   * `_suppressAutoRender` is set before the microtask fires, the render is
   * skipped. Used by `add()` so a chained `play()` can suppress the
   * pre-animation flash described in issue #317.
   */
  protected _scheduleRender(): void {
    if (!this._autoRender || this._disposed || this._suppressAutoRender) return;
    if (this._pendingRender) return;
    this._pendingRender = true;
    queueMicrotask(() => {
      if (!this._pendingRender) return;
      this._pendingRender = false;
      if (this._suppressAutoRender || this._disposed) return;
      this._render();
    });
  }

  protected _cancelPendingRender(): void {
    this._pendingRender = false;
  }

  /**
   * Render a single frame.
   * Syncs only dirty mobjects before rendering for performance.
   * Protected so subclasses (e.g. ZoomedScene) can override for multi-pass rendering.
   */
  protected _render(): void {
    if (this._disposed) return;

    // Sync only dirty mobjects (dirty flag optimization)
    this._syncDirtyMobjects();

    // Update frustum for culling if enabled
    if (this._frustumCulling) {
      this._updateFrustum();
    }

    if (this._multiCamera !== null && !this.isHeadless) {
      this._renderMultiCamera();
    } else {
      this._renderer.render(this._threeScene, this._camera.getCamera());
    }
  }

  /**
   * Render via the attached MultiCamera. Clears the full canvas first so
   * arbitrary viewport layouts (e.g. picture-in-picture) don't leak stale
   * pixels, and restores renderer state via try/finally even if a camera
   * render throws.
   */
  protected _renderMultiCamera(): void {
    const mc = this._multiCamera;
    if (mc === null) return;
    const threeRenderer = this._renderer.getThreeRenderer();
    // Skip if the WebGL context is gone — Renderer.render() guards this for
    // the default path, so we mirror that behavior here.
    if (threeRenderer.getContext().isContextLost()) return;

    const width = this._renderer.width;
    const height = this._renderer.height;

    // Clear the full canvas before per-viewport rendering so areas not
    // covered by any viewport (or transparent regions) don't show stale pixels.
    threeRenderer.setScissorTest(false);
    threeRenderer.setViewport(0, 0, width, height);
    threeRenderer.clear();

    try {
      mc.render(threeRenderer, this._threeScene, width, height);
    } finally {
      // Always restore full viewport / disabled scissor so the next render
      // (single-camera fallback, screenshot, etc.) starts from a clean state.
      threeRenderer.setScissorTest(false);
      threeRenderer.setViewport(0, 0, width, height);
    }
  }

  /**
   * Sync only mobjects that have been modified (dirty flag optimization).
   */
  private _syncDirtyMobjects(): void {
    for (const mobject of this._mobjects) {
      if (mobject._dirty) {
        mobject._syncToThree();
        mobject._dirty = false;
      }
    }
  }

  /**
   * Update frustum for culling calculations.
   */
  private _updateFrustum(): void {
    const camera = this._camera.getCamera();
    this._projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._projScreenMatrix);
  }

  /**
   * Check if an object is within the camera's view frustum.
   * Useful for manual culling checks or debugging.
   * @param object - Three.js object to check
   * @returns true if object is in view or if culling is disabled
   */
  isInView(object: THREE.Object3D): boolean {
    if (!this._frustumCulling) return true;

    // Use geometry bounding sphere if available
    if (object instanceof THREE.Mesh && object.geometry?.boundingSphere) {
      // Ensure bounding sphere is computed
      if (!object.geometry.boundingSphere) {
        object.geometry.computeBoundingSphere();
      }

      // Transform bounding sphere to world space
      const sphere = object.geometry.boundingSphere.clone();
      sphere.applyMatrix4(object.matrixWorld);

      return this._frustum.intersectsSphere(sphere);
    }

    // Fallback: use bounding box
    Scene._tempBox3.setFromObject(object);
    return this._frustum.intersectsBox(Scene._tempBox3);
  }

  /**
   * Check if the timeline is finished and resolve the play promise.
   * Shared by both the rAF loop and the background timer.
   */
  private _checkFinished(): void {
    if (this._timeline && this._timeline.isFinished()) {
      this._isPlaying = false;
      this._stopRenderLoop();

      // Resolve play promise
      if (this._playPromiseResolve) {
        this._playPromiseResolve();
        this._playPromiseResolve = null;
      }
    }
  }

  /**
   * Run one tick of the simulation: update mobjects, advance the
   * timeline, update the camera, render, and check for completion.
   * Shared by the rAF loop, headless setInterval, and background-tab fallback.
   */
  private _tickFrame(dt: number): void {
    // Update all mobjects (run updaters) BEFORE animations,
    // so animations can override updater-set values (e.g. Create
    // hiding fill while an updater rebuilds the polygon via become()).
    for (const mobject of this._mobjects) {
      mobject.update(dt);
    }

    // Update timeline (animations override updater state)
    if (this._timeline) {
      this._timeline.update(dt);
      this._currentTime = this._timeline.getCurrentTime();
    }

    // Update camera frame updaters AFTER animations so camera
    // updaters see the latest positions set by MoveAlongPath etc.
    this._camera.updateFrame(dt);

    // Advance any animatable cameras (MovingCamera, ThreeDCamera) attached
    // to a MultiCamera so their per-frame interpolation continues to tick.
    if (this._multiCamera !== null) {
      this._multiCamera.update(dt);
    }

    this._render();
    this._checkFinished();
  }

  /**
   * Start the animation render loop with frame rate control.
   * Uses requestAnimationFrame for smooth foreground rendering,
   * plus a setInterval fallback so the timeline still advances
   * when the tab is in the background (rAF is suspended).
   */
  private _startRenderLoop(): void {
    if (this._animationFrameId !== null) return;
    if (this.isHeadless && this._backgroundTimerId !== null) return;

    this._lastFrameTime = performance.now();

    // In headless mode (no DOM), requestAnimationFrame is unavailable.
    // Use setInterval to drive the loop so animations complete.
    if (this.isHeadless) {
      this._backgroundTimerId = setInterval(() => {
        if (!this._isPlaying || !this._timeline) {
          return;
        }
        try {
          const now = performance.now();
          const dt = (now - this._lastFrameTime) / 1000;
          this._lastFrameTime = now;
          this._tickFrame(dt);
        } catch (err) {
          logger.error('Scene: headless render loop error, stopping:', err);
          this._stopRenderLoop();
          this._isPlaying = false;
        }
      }, 16);
      return;
    }

    const loop = (currentTime: number) => {
      // Schedule next frame first (for smoother animations)
      if (this._isPlaying) {
        this._animationFrameId = requestAnimationFrame(loop);
      } else {
        this._animationFrameId = null;
        return;
      }

      // Frame rate control: skip frames if running ahead of target
      const elapsed = currentTime - this._lastFrameTime;
      if (elapsed < this._targetFrameTime * 0.9) {
        return; // Skip this frame, running too fast
      }

      const dt = elapsed / 1000;
      this._lastFrameTime = currentTime;
      this._tickFrame(dt);
    };

    this._animationFrameId = requestAnimationFrame(loop);

    // Background-tab fallback: setInterval is throttled to ~1Hz in
    // background tabs but NOT suspended like rAF. This ensures the
    // timeline advances and animations complete even when the tab
    // isn't visible (e.g., during automated testing).
    if (this._backgroundTimerId === null) {
      this._backgroundTimerId = setInterval(() => {
        if (!this._isPlaying || !this._timeline) {
          return;
        }
        const now = performance.now();
        const elapsed = now - this._lastFrameTime;
        // Only intervene when rAF hasn't fired for >200ms (i.e., tab is backgrounded)
        if (elapsed > 200) {
          const dt = elapsed / 1000;
          this._lastFrameTime = now;
          this._tickFrame(dt);
        }
      }, 100);
    }
  }

  /**
   * Stop the animation render loop.
   */
  private _stopRenderLoop(): void {
    if (this._animationFrameId !== null) {
      if (typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(this._animationFrameId);
      }
      this._animationFrameId = null;
    }
    if (this._backgroundTimerId !== null) {
      clearInterval(this._backgroundTimerId);
      this._backgroundTimerId = null;
    }
  }

  /**
   * Batch multiple mobject updates without re-rendering between each.
   * Useful for performance when making many changes at once.
   * @param callback - Function containing multiple mobject operations
   * @example
   * ```ts
   * scene.batch(() => {
   *   circle.setColor('red');
   *   circle.shift([1, 0, 0]);
   *   square.setStrokeOpacity(0.5);
   * });
   * ```
   */
  batch(callback: () => void): void {
    const wasAutoRender = this._autoRender;
    this._autoRender = false;
    try {
      callback();
    } finally {
      this._autoRender = wasAutoRender;
      this._syncDirtyMobjects();
      this._render();
    }
  }

  /**
   * Set the target frame rate.
   * @param fps - Target frames per second (1-120)
   */
  setTargetFps(fps: number): this {
    this._targetFps = Math.max(1, Math.min(120, fps));
    this._targetFrameTime = 1000 / this._targetFps;
    return this;
  }

  /**
   * Get the current target frame rate.
   * @returns Target fps
   */
  getTargetFps(): number {
    return this._targetFps;
  }

  /**
   * Enable or disable frustum culling.
   * @param enabled - Whether frustum culling should be enabled
   */
  setFrustumCulling(enabled: boolean): this {
    this._frustumCulling = enabled;
    return this;
  }

  /**
   * Handle window resize.
   * @param width - New width in pixels
   * @param height - New height in pixels
   */
  resize(width: number, height: number): this {
    this._renderer.resize(width, height);
    const aspectRatio = width / height;
    this._camera.setAspectRatio(aspectRatio);
    VMobject._rendererWidth = width;
    VMobject._rendererHeight = height;
    // Update per-instance context on all VMobjects (multi-scene support)
    for (const mob of this._mobjects) {
      this._setSceneContextRecursive(mob);
    }
    this._render();
    return this;
  }

  /**
   * Install ResizeObserver on the container and a window resize/orientation
   * fallback. All triggers funnel through a single rAF-debounced measurement
   * so a rotation that fires multiple events resizes once per frame.
   */
  private _installAutoResize(): void {
    if (typeof window === 'undefined' || !this._container) return;

    const measure = () => {
      this._resizeRafId = null;
      if (this._disposed || !this._container) return;
      const w = Math.round(this._container.clientWidth);
      const h = Math.round(this._container.clientHeight);
      // Guard against zero-sized (detached / display:none) containers and
      // skip when dimensions did not actually change to avoid render churn.
      if (w <= 0 || h <= 0) return;
      if (w === this._renderer.width && h === this._renderer.height) return;
      this.resize(w, h);
    };

    const schedule = () => {
      if (this._resizeRafId !== null) return;
      this._resizeRafId = requestAnimationFrame(measure);
    };

    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(schedule);
      this._resizeObserver.observe(this._container);
    }

    // Window resize covers browsers without ResizeObserver; orientationchange
    // is a belt-and-suspenders trigger for older mobile browsers where the
    // observer can lag behind device rotation.
    this._onWindowResize = schedule;
    window.addEventListener('resize', this._onWindowResize);
    window.addEventListener('orientationchange', this._onWindowResize);
  }

  private _disposeAutoResize(): void {
    if (this._resizeRafId !== null) {
      cancelAnimationFrame(this._resizeRafId);
      this._resizeRafId = null;
    }
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    if (this._onWindowResize && typeof window !== 'undefined') {
      window.removeEventListener('resize', this._onWindowResize);
      window.removeEventListener('orientationchange', this._onWindowResize);
    }
    this._onWindowResize = null;
  }

  /**
   * Get the canvas element.
   * @returns The HTMLCanvasElement used for rendering
   */
  getCanvas(): HTMLCanvasElement {
    return this._renderer.getCanvas();
  }

  /**
   * Get the container element the scene is rendered into.
   * Returns the parent element of the canvas.
   * @returns The container HTMLElement
   */
  getContainer(): HTMLElement {
    if (this.isHeadless) {
      throw new Error(
        'getContainer() is not available in headless mode. Create a Scene with a container for rendering.',
      );
    }
    const canvas = this._renderer.getCanvas();
    if (!canvas.parentElement) {
      throw new Error('Scene canvas is not attached to a container');
    }
    return canvas.parentElement;
  }

  /**
   * Get the width of the canvas in pixels.
   * @returns Canvas width in pixels
   */
  getWidth(): number {
    return this._renderer.width;
  }

  /**
   * Get the height of the canvas in pixels.
   * @returns Canvas height in pixels
   */
  getHeight(): number {
    return this._renderer.height;
  }

  /**
   * Get the background opacity (0 = fully transparent, 1 = fully opaque).
   */
  get backgroundOpacity(): number {
    return this._renderer.backgroundOpacity;
  }

  /**
   * Set the background opacity (0 = fully transparent, 1 = fully opaque).
   * Only effective if the scene was created with backgroundOpacity < 1.
   */
  set backgroundOpacity(value: number) {
    this._renderer.backgroundOpacity = value;
  }

  /**
   * Get the total duration of the current timeline.
   * @returns Duration in seconds, or 0 if no timeline
   */
  getTimelineDuration(): number {
    return this._timeline?.getDuration() ?? 0;
  }

  // ---------------------------------------------------------------------------
  // State management (save / restore / undo / redo)
  // ---------------------------------------------------------------------------

  /**
   * Get the scene's state manager for advanced undo/redo control.
   */
  get stateManager(): SceneStateManager {
    return this._stateManager;
  }

  /**
   * Save the current state of all scene mobjects.
   * Pushes onto the undo stack and clears the redo stack.
   *
   * @param label - Optional human-readable label
   * @returns The captured SceneSnapshot
   *
   * @example
   * ```ts
   * scene.add(circle, square);
   * scene.saveState();
   * circle.shift([2, 0, 0]);
   * scene.undo(); // circle returns to original position
   * ```
   */
  saveState(label?: string): SceneSnapshot {
    return this._stateManager.save(label);
  }

  /**
   * Undo the last change (restore the most recently saved state).
   * The current state is pushed to the redo stack.
   *
   * @returns true if undo was applied, false if nothing to undo
   */
  undo(): boolean {
    const result = this._stateManager.undo();
    if (result && this._autoRender) {
      this._render();
    }
    return result;
  }

  /**
   * Redo the last undone change.
   * The current state is pushed to the undo stack.
   *
   * @returns true if redo was applied, false if nothing to redo
   */
  redo(): boolean {
    const result = this._stateManager.redo();
    if (result && this._autoRender) {
      this._render();
    }
    return result;
  }

  /**
   * Get a snapshot of the current scene state without modifying stacks.
   */
  getState(label?: string): SceneSnapshot {
    return this._stateManager.getState(label);
  }

  /**
   * Apply a previously captured snapshot, overwriting all mobject states.
   * Does NOT modify undo/redo stacks. Call saveState() first to preserve.
   */
  setState(snapshot: SceneSnapshot): void {
    this._stateManager.setState(snapshot);
    if (this._autoRender) {
      this._render();
    }
  }

  /**
   * Force render a single frame.
   * Useful for video export where frames need to be captured at specific times.
   */
  render(): void {
    this._render();
  }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  /**
   * Export the scene animation as a file (GIF or video).
   * Format is inferred from the filename extension.
   *
   * Supported extensions:
   * - `.gif` - Animated GIF
   * - `.webm` - WebM video (VP9)
   * - `.mp4` - MP4 video (browser codec support varies)
   * - `.mov` - QuickTime video (browser codec support varies)
   *
   * @param filename - Output filename (e.g. 'animation.gif', 'scene.webm')
   * @param options - Export options (fps, quality, dimensions, etc.)
   * @returns The exported Blob
   *
   * @example
   * ```ts
   * // Export as GIF
   * const blob = await scene.export('animation.gif');
   *
   * // Export as WebM with custom options
   * const blob = await scene.export('scene.webm', {
   *   fps: 30,
   *   quality: 0.8,
   *   onProgress: (p) => console.log(`${Math.round(p * 100)}%`),
   * });
   * ```
   */
  async export(filename: string, options?: SceneExportOptions): Promise<Blob> {
    if (this.isHeadless) {
      throw new Error(
        'export() is not available in headless mode. Create a Scene with a container for rendering and exporting.',
      );
    }
    const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();

    let blob: Blob;

    if (ext === '.gif') {
      const { GifExporter } = await import('../export/GifExporter');
      const exporter = new GifExporter(this, {
        fps: options?.fps,
        quality: options?.quality as number | undefined,
        width: options?.width,
        height: options?.height,
        duration: options?.duration,
        onProgress: options?.onProgress,
        repeat: options?.repeat,
        workers: options?.workers,
      });
      blob = await exporter.exportTimeline(options?.duration);
      GifExporter.download(blob, filename);
    } else if (ext === '.webm' || ext === '.mp4' || ext === '.mov') {
      const { VideoExporter } = await import('../export/VideoExporter');
      const format = ext === '.mp4' ? 'mp4' : ext === '.mov' ? 'mov' : 'webm';
      const exporter = new VideoExporter(this, {
        fps: options?.fps,
        quality: options?.quality,
        format,
        width: options?.width,
        height: options?.height,
        duration: options?.duration,
        onProgress: options?.onProgress,
        includeAudio: options?.includeAudio,
      });
      blob = await exporter.exportTimeline(options?.duration);
      VideoExporter.download(blob, filename);
    } else {
      throw new Error(`Unsupported export format "${ext}". Supported: .gif, .webm, .mp4, .mov`);
    }

    return blob;
  }

  /**
   * Clean up all resources (renderer, mobjects, audio).
   */
  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;

    // Detach auto-resize observer/listeners
    this._disposeAutoResize();

    // Stop playback
    this._stopRenderLoop();
    this._isPlaying = false;

    // Cancel any pending play() promise
    if (this._playPromiseResolve) {
      this._playPromiseResolve();
      this._playPromiseResolve = null;
    }

    // Cancel any pending wait() timers
    for (const cleanup of [...this._waitCleanups]) {
      cleanup();
    }
    this._waitCleanups.length = 0;

    // Dispose mobjects
    for (const mobject of this._mobjects) {
      mobject.dispose();
    }
    this._mobjects.clear();

    // Dispose renderer
    this._renderer.dispose();

    // Clear timeline
    this._timeline = null;

    // Dispose audio
    if (this._audioManager) {
      this._audioManager.dispose();
      this._audioManager = null;
    }
  }
}
