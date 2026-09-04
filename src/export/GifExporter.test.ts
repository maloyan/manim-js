// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GifExporter } from './GifExporter';

// ---------------------------------------------------------------------------
// Mock gif.js module
// ---------------------------------------------------------------------------

let mockGifInstance: {
  addFrame: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  render: ReturnType<typeof vi.fn>;
  abort: ReturnType<typeof vi.fn>;
  _handlers: Record<string, Function>;
};

function createMockGifInstance() {
  const handlers: Record<string, Function> = {};
  return {
    addFrame: vi.fn(),
    on: vi.fn((event: string, cb: Function) => {
      handlers[event] = cb;
    }),
    render: vi.fn(),
    abort: vi.fn(),
    _handlers: handlers,
  };
}

vi.mock('gif.js', () => {
  return {
    default: vi.fn(function MockGIF() {
      Object.assign(this, mockGifInstance);
      return this;
    }),
  };
});

// Save original createElement before any mocking
const origCreateElement = document.createElement.bind(document);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockScene(overrides?: Record<string, unknown>) {
  const mockCanvas = origCreateElement('canvas');
  return {
    renderer: { width: 800, height: 600 },
    getWidth: () => 800,
    getHeight: () => 600,
    getCanvas: () => mockCanvas,
    getTimelineDuration: () => 5,
    timeline: { getDuration: () => 3 },
    seek: vi.fn(),
    render: vi.fn(),
    ...overrides,
  } as any;
}

/** Mock document.createElement to intercept 'canvas' for the copy canvas */
function mockCreateElementForCanvas(mockCtx: Record<string, any>) {
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    const el = origCreateElement(tag);
    if (tag === 'canvas') {
      (el as any).getContext = vi.fn(() => mockCtx);
    }
    return el;
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GifExporter', () => {
  beforeEach(() => {
    mockGifInstance = createMockGifInstance();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // ---- Constructor defaults ----

  it('constructor applies ?? fallback defaults correctly', () => {
    const scene = createMockScene();
    const exporter = new GifExporter(scene);
    const opts = (exporter as any)._options;

    expect(opts.fps).toBe(30);
    expect(opts.quality).toBe(10);
    expect(opts.width).toBe(800);
    expect(opts.height).toBe(600);
    expect(opts.duration).toBe(0);
    expect(opts.workers).toBe(4);
    expect(opts.repeat).toBe(0);
    expect(typeof opts.onProgress).toBe('function');
    expect(opts.workerScriptUrl).toBe('/node_modules/gif.js/dist/gif.worker.js');
    expect(opts.allowCdnFallback).toBe(true);
  });

  it('constructor uses provided options over defaults', () => {
    const scene = createMockScene();
    const onProgress = vi.fn();
    const exporter = new GifExporter(scene, {
      fps: 15,
      quality: 5,
      width: 400,
      height: 300,
      duration: 10,
      workers: 2,
      repeat: -1,
      onProgress,
    });
    const opts = (exporter as any)._options;

    expect(opts.fps).toBe(15);
    expect(opts.quality).toBe(5);
    expect(opts.width).toBe(400);
    expect(opts.height).toBe(300);
    expect(opts.duration).toBe(10);
    expect(opts.workers).toBe(2);
    expect(opts.repeat).toBe(-1);
    expect(opts.onProgress).toBe(onProgress);
  });

  // ---- _getTimelineDuration ----

  it('_getTimelineDuration returns timeline duration when available', () => {
    const scene = createMockScene();
    const exporter = new GifExporter(scene);
    const duration = (exporter as any)._getTimelineDuration();
    expect(duration).toBe(3);
  });

  it('_getTimelineDuration returns null when no timeline', () => {
    const scene = createMockScene({ timeline: null });
    const exporter = new GifExporter(scene);
    const duration = (exporter as any)._getTimelineDuration();
    expect(duration).toBeNull();
  });

  // ---- _createWorkerBlobUrl ----

  it('_createWorkerBlobUrl fetches local worker script', async () => {
    const scene = createMockScene();
    const exporter = new GifExporter(scene);

    const fakeUrl = 'blob:http://localhost/worker';
    const origCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = vi.fn(() => fakeUrl);

    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          text: () => Promise.resolve('worker-script-content'),
        }),
      ),
    );

    const url = await (exporter as any)._createWorkerBlobUrl();
    expect(url).toBe(fakeUrl);
    expect(fetch).toHaveBeenCalledWith('/node_modules/gif.js/dist/gif.worker.js');

    URL.createObjectURL = origCreateObjectURL;
  });

  it('_createWorkerBlobUrl falls back to CDN when local fetch fails', async () => {
    const scene = createMockScene();
    const exporter = new GifExporter(scene);

    const fakeUrl = 'blob:http://localhost/cdn-worker';
    const origCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = vi.fn(() => fakeUrl);

    let callCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ ok: false });
        }
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve('cdn-worker-content'),
        });
      }),
    );

    const url = await (exporter as any)._createWorkerBlobUrl();
    expect(url).toBe(fakeUrl);
    expect(fetch).toHaveBeenCalledTimes(2);

    URL.createObjectURL = origCreateObjectURL;
  });

  it('_createWorkerBlobUrl throws when both local and CDN fail', async () => {
    const scene = createMockScene();
    const exporter = new GifExporter(scene);

    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false })),
    );

    await expect((exporter as any)._createWorkerBlobUrl()).rejects.toThrow(
      'Failed to load gif.js worker script',
    );
  });

  it('_createWorkerBlobUrl supports a configured worker and disabled CDN fallback', async () => {
    const scene = createMockScene();
    const exporter = new GifExporter(scene, {
      workerScriptUrl: '/assets/gif.worker.js',
      allowCdnFallback: false,
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false })),
    );

    await expect((exporter as any)._createWorkerBlobUrl()).rejects.toThrow(
      'Failed to load configured gif.js worker script',
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('/assets/gif.worker.js');
  });

  // ---- exportTimeline ----

  it('exportTimeline captures frames and resolves on finished', async () => {
    const scene = createMockScene();
    const onProgress = vi.fn();
    const exporter = new GifExporter(scene, {
      fps: 10,
      duration: 1,
      onProgress,
    });

    vi.spyOn(exporter as any, '_createWorkerBlobUrl').mockResolvedValue('blob:worker');

    const mockCtx = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4), width: 800, height: 600 })),
    };
    mockCreateElementForCanvas(mockCtx);

    mockGifInstance.render.mockImplementation(() => {
      const finishedHandler = mockGifInstance._handlers['finished'];
      if (finishedHandler) {
        setTimeout(() => finishedHandler(new Blob(['gif-data'], { type: 'image/gif' })), 0);
      }
    });

    const origRevokeObjectURL = URL.revokeObjectURL;
    URL.revokeObjectURL = vi.fn();

    const blob = await exporter.exportTimeline();

    expect(blob).toBeInstanceOf(Blob);
    // 1 second at 10fps = 10 frames
    expect(mockGifInstance.addFrame).toHaveBeenCalledTimes(10);
    expect(scene.seek).toHaveBeenCalledTimes(10);
    expect(onProgress).toHaveBeenCalled();

    URL.revokeObjectURL = origRevokeObjectURL;
  });

  it('exportTimeline uses fallback duration of 5 when no duration provided', async () => {
    const scene = createMockScene({ timeline: null });
    const exporter = new GifExporter(scene, { fps: 10 });

    vi.spyOn(exporter as any, '_createWorkerBlobUrl').mockResolvedValue('blob:url');

    const mockCtx = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4), width: 800, height: 600 })),
    };
    mockCreateElementForCanvas(mockCtx);

    mockGifInstance.render.mockImplementation(() => {
      const handler = mockGifInstance._handlers['finished'];
      if (handler) setTimeout(() => handler(new Blob(['gif'], { type: 'image/gif' })), 0);
    });

    const origRevokeObjectURL = URL.revokeObjectURL;
    URL.revokeObjectURL = vi.fn();

    const blob = await exporter.exportTimeline();
    expect(blob).toBeInstanceOf(Blob);
    // 5 seconds at 10fps = 50 frames
    expect(mockGifInstance.addFrame).toHaveBeenCalledTimes(50);

    URL.revokeObjectURL = origRevokeObjectURL;
  });

  it('exportTimeline rejects with abort error when gif emits abort', async () => {
    const scene = createMockScene();
    const exporter = new GifExporter(scene, { fps: 10, duration: 0.1 });

    vi.spyOn(exporter as any, '_createWorkerBlobUrl').mockResolvedValue('blob:url');

    const mockCtx = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4), width: 800, height: 600 })),
    };
    mockCreateElementForCanvas(mockCtx);

    const origRevokeObjectURL = URL.revokeObjectURL;
    URL.revokeObjectURL = vi.fn();

    mockGifInstance.render.mockImplementation(() => {
      // Trigger the abort event
      const abortHandler = mockGifInstance._handlers['abort'];
      if (abortHandler) {
        setTimeout(() => abortHandler(), 0);
      }
    });

    await expect(exporter.exportTimeline()).rejects.toThrow('GIF encoding was aborted');

    URL.revokeObjectURL = origRevokeObjectURL;
  });

  it('exportTimeline rejects on render error', async () => {
    const scene = createMockScene();
    const exporter = new GifExporter(scene, { fps: 10, duration: 0.1 });

    vi.spyOn(exporter as any, '_createWorkerBlobUrl').mockResolvedValue('blob:url');

    const mockCtx = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4), width: 800, height: 600 })),
    };
    mockCreateElementForCanvas(mockCtx);

    const origRevokeObjectURL = URL.revokeObjectURL;
    URL.revokeObjectURL = vi.fn();

    mockGifInstance.render.mockImplementation(() => {
      throw new Error('render failed');
    });

    await expect(exporter.exportTimeline()).rejects.toThrow('render failed');

    URL.revokeObjectURL = origRevokeObjectURL;
  });

  it('exportTimeline reports encoding progress via gif on("progress")', async () => {
    const scene = createMockScene();
    const onProgress = vi.fn();
    const exporter = new GifExporter(scene, { fps: 10, duration: 0.1, onProgress });

    vi.spyOn(exporter as any, '_createWorkerBlobUrl').mockResolvedValue('blob:url');

    const mockCtx = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4), width: 800, height: 600 })),
    };
    mockCreateElementForCanvas(mockCtx);

    const origRevokeObjectURL = URL.revokeObjectURL;
    URL.revokeObjectURL = vi.fn();

    mockGifInstance.render.mockImplementation(() => {
      const progressHandler = mockGifInstance._handlers['progress'];
      if (progressHandler) progressHandler(0.5);
      const finishedHandler = mockGifInstance._handlers['finished'];
      if (finishedHandler) {
        setTimeout(() => finishedHandler(new Blob(['gif'], { type: 'image/gif' })), 0);
      }
    });

    await exporter.exportTimeline();

    // Should have been called with 0.5 + 0.5 * 0.5 = 0.75 for encoding progress
    expect(onProgress).toHaveBeenCalledWith(0.75);

    URL.revokeObjectURL = origRevokeObjectURL;
  });

  // ---- exportAndDownload ----

  it('exportAndDownload calls exportTimeline and download', async () => {
    const scene = createMockScene();
    const exporter = new GifExporter(scene);
    const gifBlob = new Blob(['gif'], { type: 'image/gif' });

    vi.spyOn(exporter, 'exportTimeline').mockResolvedValue(gifBlob);
    const downloadSpy = vi.spyOn(GifExporter, 'download').mockImplementation(() => {});

    await exporter.exportAndDownload('test.gif', 2);

    expect(exporter.exportTimeline).toHaveBeenCalledWith(2);
    expect(downloadSpy).toHaveBeenCalledWith(gifBlob, 'test.gif');
  });

  // ---- createGifExporter factory ----

  it('createGifExporter returns a GifExporter instance', async () => {
    const { createGifExporter } = await import('./GifExporter');
    const scene = createMockScene();
    const exporter = createGifExporter(scene, { fps: 20 });
    expect(exporter).toBeInstanceOf(GifExporter);
    expect((exporter as any)._options.fps).toBe(20);
  });
});
