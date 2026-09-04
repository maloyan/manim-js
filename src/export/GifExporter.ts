import GIF from 'gif.js';

/**
 * Duck-type interface for Scene, used to avoid circular imports.
 * GifExporter only needs canvas access, seek, timeline, and renderer dimensions.
 */
interface ExportableScene {
  renderer: { width: number; height: number };
  getCanvas(): HTMLCanvasElement;
  seek(time: number): void;
  timeline: { getDuration(): number } | null;
}

interface GifExportOptions {
  fps?: number; // default 30 (GIFs are typically lower fps)
  quality?: number; // 1-30, lower is better quality, default 10
  width?: number; // default scene width
  height?: number; // default scene height
  duration?: number; // auto-detect from timeline
  workers?: number; // default 4
  repeat?: number; // 0 = loop forever, -1 = no repeat, default 0
  onProgress?: (progress: number) => void;
  /** Worker source to fetch and wrap in a same-origin Blob URL. */
  workerScriptUrl?: string;
  /** Whether a failed worker fetch may fall back to jsDelivr. Default: true. */
  allowCdnFallback?: boolean;
}

export class GifExporter {
  private _scene: ExportableScene;
  private _options: Required<GifExportOptions>;

  constructor(scene: ExportableScene, options?: GifExportOptions) {
    this._scene = scene;
    this._options = {
      fps: options?.fps ?? 30,
      quality: options?.quality ?? 10,
      width: options?.width ?? scene.renderer.width,
      height: options?.height ?? scene.renderer.height,
      duration: options?.duration ?? 0,
      workers: options?.workers ?? 4,
      repeat: options?.repeat ?? 0,
      onProgress: options?.onProgress ?? (() => {}),
      workerScriptUrl: options?.workerScriptUrl ?? '/node_modules/gif.js/dist/gif.worker.js',
      allowCdnFallback: options?.allowCdnFallback ?? true,
    };
  }

  /**
   * Export the timeline as a GIF
   */
  async exportTimeline(duration?: number): Promise<Blob> {
    const totalDuration = (duration || this._options.duration || this._getTimelineDuration()) ?? 5;
    const totalFrames = Math.ceil(totalDuration * this._options.fps);
    const frameDelay = Math.round(1000 / this._options.fps);

    // Create a same-origin Blob URL for the worker script.
    // gif.js uses new Worker(url) which enforces same-origin policy,
    // so a cross-origin CDN URL fails silently.
    const workerBlobUrl = await this._createWorkerBlobUrl();

    // Create GIF encoder
    const gif = new GIF({
      workers: this._options.workers,
      quality: this._options.quality,
      width: this._options.width,
      height: this._options.height,
      repeat: this._options.repeat,
      workerScript: workerBlobUrl,
    });

    const canvas = this._scene.getCanvas();
    // Use a 2D canvas to read WebGL pixels reliably
    const copyCanvas = document.createElement('canvas');
    copyCanvas.width = this._options.width;
    copyCanvas.height = this._options.height;
    const copyCtx = copyCanvas.getContext('2d')!;

    // Capture frames
    for (let frame = 0; frame < totalFrames; frame++) {
      const time = frame / this._options.fps;

      // Seek to time (this also renders the frame)
      this._scene.seek(time);

      // Copy WebGL canvas to 2D canvas, then extract ImageData.
      // Passing a WebGL canvas directly to gif.js can produce blank
      // frames depending on timing and preserveDrawingBuffer state.
      copyCtx.clearRect(0, 0, copyCanvas.width, copyCanvas.height);
      copyCtx.drawImage(canvas, 0, 0, copyCanvas.width, copyCanvas.height);
      const imageData = copyCtx.getImageData(0, 0, copyCanvas.width, copyCanvas.height);

      // Add ImageData directly — avoids gif.js internal canvas operations
      gif.addFrame(imageData, {
        delay: frameDelay,
      });

      // Report capture progress (first half of total progress)
      this._options.onProgress((frame / totalFrames) * 0.5);
    }

    // Render GIF
    return new Promise<Blob>((resolve, reject) => {
      const timeout = setTimeout(() => {
        gif.abort();
        URL.revokeObjectURL(workerBlobUrl);
        reject(new Error('GIF encoding timed out after 60 seconds'));
      }, 60_000);

      gif.on('progress', (p: number) => {
        // Encoding progress (second half)
        this._options.onProgress(0.5 + p * 0.5);
      });

      gif.on('finished', (blob: Blob) => {
        clearTimeout(timeout);
        URL.revokeObjectURL(workerBlobUrl);
        resolve(blob);
      });

      (gif as unknown as { on: (event: string, cb: () => void) => void }).on('abort', () => {
        clearTimeout(timeout);
        URL.revokeObjectURL(workerBlobUrl);
        reject(new Error('GIF encoding was aborted'));
      });

      try {
        gif.render();
      } catch (error) {
        clearTimeout(timeout);
        URL.revokeObjectURL(workerBlobUrl);
        reject(error);
      }
    });
  }

  /**
   * Get timeline duration if available
   */
  private _getTimelineDuration(): number | null {
    const timeline = this._scene.timeline;
    if (timeline) {
      return timeline.getDuration();
    }
    return null;
  }

  /**
   * Create a same-origin Blob URL for the gif.js worker script.
   * Fetches the worker from node_modules via Vite's dev server,
   * then wraps it in a Blob URL to satisfy same-origin Worker policy.
   */
  private async _createWorkerBlobUrl(): Promise<string> {
    // In Vite dev mode, node_modules are served at their package paths
    const response = await fetch(this._options.workerScriptUrl);
    if (!response.ok) {
      if (!this._options.allowCdnFallback) {
        throw new Error('Failed to load configured gif.js worker script');
      }
      // Fallback: try CDN
      const cdnResponse = await fetch(
        'https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.worker.js',
      );
      if (!cdnResponse.ok) throw new Error('Failed to load gif.js worker script');
      const text = await cdnResponse.text();
      return URL.createObjectURL(new Blob([text], { type: 'application/javascript' }));
    }
    const text = await response.text();
    return URL.createObjectURL(new Blob([text], { type: 'application/javascript' }));
  }

  /**
   * Download the GIF
   */
  static download(blob: Blob, filename: string = 'animation.gif'): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Convenience method: export and download
   */
  async exportAndDownload(filename: string = 'animation.gif', duration?: number): Promise<void> {
    const blob = await this.exportTimeline(duration);
    GifExporter.download(blob, filename);
  }
}

export function createGifExporter(scene: ExportableScene, options?: GifExportOptions): GifExporter {
  return new GifExporter(scene, options);
}

export type { GifExportOptions };
