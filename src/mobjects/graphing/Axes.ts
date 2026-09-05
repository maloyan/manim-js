import { Group } from '../../core/Group';
import { Mobject, Vector3Tuple } from '../../core/Mobject';
import { VMobject } from '../../core/VMobject';
import { VGroup } from '../../core/VGroup';
import { VDict } from '../../core/VDict';
import { NumberLine, NumberLineOptions } from './NumberLine';
import { FunctionGraph, FunctionGraphOptions } from './FunctionGraph';
import { MathTexImage } from '../../mobjects/text/MathTexImage';
import { Line } from '../../mobjects/geometry/Line';
import { DashedLine } from '../../mobjects/geometry/DashedLine';
import { Dot } from '../../mobjects/geometry/Dot';

/**
 * Options for creating Axes
 */
export interface AxesOptions {
  /** X-axis range as [min, max] or [min, max, step]. Default: [-5, 5, 1] */
  xRange?: [number, number] | [number, number, number];
  /** Y-axis range as [min, max] or [min, max, step]. Default: [-3, 3, 1] */
  yRange?: [number, number] | [number, number, number];
  /** Visual length of the x-axis. Default: 10 */
  xLength?: number;
  /** Visual length of the y-axis. Default: 6 */
  yLength?: number;
  /** Stroke color for axes. Default: '#ffffff' */
  color?: string;
  /** Common configuration for both axes */
  axisConfig?: Partial<NumberLineOptions>;
  /** Configuration specific to x-axis (overrides axisConfig) */
  xAxisConfig?: Partial<NumberLineOptions>;
  /** Configuration specific to y-axis (overrides axisConfig) */
  yAxisConfig?: Partial<NumberLineOptions>;
  /** Whether to include arrow tips on axes. Default: true */
  tips?: boolean;
  /** Length of arrow tips. Default: 0.25 */
  tipLength?: number;
}

/**
 * Axes - A coordinate system with x and y axes
 *
 * Creates a 2D coordinate system with configurable ranges and styling.
 * Supports coordinate transformations between graph space and visual space.
 *
 * @example
 * ```typescript
 * // Create default axes
 * const axes = new Axes();
 *
 * // Create axes with custom ranges
 * const customAxes = new Axes({
 *   xRange: [0, 10, 1],
 *   yRange: [-1, 1, 0.5],
 *   xLength: 8,
 *   yLength: 4
 * });
 *
 * // Get a point in visual coordinates
 * const point = axes.coordsToPoint(3, 2);
 * ```
 */
export class Axes extends Group {
  /** The x-axis NumberLine */
  xAxis: NumberLine;
  /** The y-axis NumberLine */
  yAxis: NumberLine;

  protected _xRange: [number, number, number];
  protected _yRange: [number, number, number];
  protected _xLength: number;
  protected _yLength: number;
  protected _tips: boolean;
  protected _tipLength: number;
  protected _xTip: VMobject | null = null;
  protected _yTip: VMobject | null = null;

  constructor(options: AxesOptions = {}) {
    super();

    const {
      xRange: xRangeRaw = [-5, 5, 1],
      yRange: yRangeRaw = [-3, 3, 1],
      xLength = 10,
      yLength = 6,
      color = '#ffffff',
      axisConfig = {},
      xAxisConfig = {},
      yAxisConfig = {},
      tipLength = 0.25,
    } = options;

    // Normalize 2-element ranges to 3-element [min, max, step] (default step = 1)
    const xRange: [number, number, number] =
      xRangeRaw.length === 2
        ? [xRangeRaw[0], xRangeRaw[1], 1]
        : (xRangeRaw as [number, number, number]);
    const yRange: [number, number, number] =
      yRangeRaw.length === 2
        ? [yRangeRaw[0], yRangeRaw[1], 1]
        : (yRangeRaw as [number, number, number]);

    this._xRange = [...xRange];
    this._yRange = [...yRange];
    this._xLength = xLength;
    this._yLength = yLength;
    // Support includeTip from axisConfig (Python Manim pattern: axis_config={"include_tip": False})
    this._tips =
      options.tips ??
      ((axisConfig as Record<string, unknown>)?.includeTip as boolean | undefined) ??
      true;
    this._tipLength = tipLength;

    // Create x-axis (Manim excludes origin label by default)
    const xConfig: NumberLineOptions = {
      color,
      numbersToExclude: [0],
      tickSize: 0.1,
      ...axisConfig,
      ...xAxisConfig,
      xRange: this._xRange,
      length: this._xLength,
    };
    this.xAxis = new NumberLine(xConfig);

    // Create y-axis (rotated 90 degrees, Manim excludes origin label by default)
    // Use smaller tick size for the y-axis (Manim default behavior)
    const yConfig: NumberLineOptions = {
      color,
      numbersToExclude: [0],
      tickSize: 0.12,
      ...axisConfig,
      ...yAxisConfig,
      xRange: this._yRange,
      length: this._yLength,
    };
    this.yAxis = new NumberLine(yConfig);
    this.yAxis.rotate(Math.PI / 2);
    // Bake the +90° rotation into the line geometry and the label child positions
    // now (eager), so the label-repositioning loop below reads already-rotated
    // positions. #417 made rotation deferred; without this normalize the rotation
    // would otherwise linger on the live transform (never re-normalized in the
    // render path) and the labels — authored against the pre-#417 eager-rotation
    // contract — would render as a stray horizontal row instead of a column.
    this.yAxis.normalizeTransform();

    // Counter-rotate y-axis number labels so text stays horizontal,
    // and reposition them to the left of the axis
    for (const label of this.yAxis.getNumberLabels()) {
      label.rotate(-Math.PI / 2);
      // After counter-rotation, the label is horizontal but its position
      // (which was set relative to a horizontal number line) has been rotated.
      // The label's local position was (x, yBelow, 0) in the unrotated line.
      // After the line rotates 90° CCW, that becomes (-yBelow, x, 0).
      // We need the label to sit to the left of the tick at visual y = x.
      // Current position after rotation: (-yBelow, x, 0) — we want (-offset, x, 0)
      // where offset accounts for label width.
      const curY = label.position.y;
      // curX is the negated below-offset; curY is the original x-position on the line
      // Place label to the left of the axis with consistent offset
      label.position.set(-0.45, curY, 0);
    }

    // Position axes so they intersect at the origin (0,0) in graph space
    const xOriginVisual = this._numberToVisualX(0);
    const yOriginVisual = this._numberToVisualY(0);
    this.yAxis.position.x = xOriginVisual;
    this.xAxis.position.y = yOriginVisual;

    this.add(this.xAxis);
    this.add(this.yAxis);

    // Add arrow tips if enabled
    if (this._tips) {
      this._addTips(color);
    }
  }

  /**
   * Add arrow tips to the axes
   */
  private _addTips(color: string): void {
    const xEnd = this._xLength / 2;
    const yEnd = this._yLength / 2;
    const tipWidth = this._tipLength * 0.6;

    // The axes are offset so they intersect at the graph origin (0,0).
    // Tips must be placed at the same offsets so they attach to the axis endpoints.
    const xAxisY = this._numberToVisualY(0); // y-offset of the x-axis line
    const yAxisX = this._numberToVisualX(0); // x-offset of the y-axis line

    // Helper to create a triangular tip as a filled VMobject
    const createTip = (tipPoint: number[], baseLeft: number[], baseRight: number[]): VMobject => {
      const tip = new VMobject();
      tip.color = color;
      tip.fillOpacity = 1;
      tip.strokeWidth = 0;

      const addLineSegment = (points: number[][], p0: number[], p1: number[], isFirst: boolean) => {
        const dx = p1[0] - p0[0];
        const dy = p1[1] - p0[1];
        const dz = p1[2] - p0[2];
        if (isFirst) points.push([...p0]);
        points.push([p0[0] + dx / 3, p0[1] + dy / 3, p0[2] + dz / 3]);
        points.push([p0[0] + (2 * dx) / 3, p0[1] + (2 * dy) / 3, p0[2] + (2 * dz) / 3]);
        points.push([...p1]);
      };

      const points: number[][] = [];
      addLineSegment(points, baseLeft, tipPoint, true);
      addLineSegment(points, tipPoint, baseRight, false);
      addLineSegment(points, baseRight, baseLeft, false);
      tip.setPoints3D(points);
      return tip;
    };

    // X-axis tip (pointing right) — positioned at the x-axis's vertical offset
    this._xTip = createTip(
      [xEnd + this._tipLength, xAxisY, 0],
      [xEnd, xAxisY + tipWidth, 0],
      [xEnd, xAxisY - tipWidth, 0],
    );
    this.add(this._xTip);

    // Y-axis tip (pointing up) — positioned at the y-axis's horizontal offset
    this._yTip = createTip(
      [yAxisX, yEnd + this._tipLength, 0],
      [yAxisX - tipWidth, yEnd, 0],
      [yAxisX + tipWidth, yEnd, 0],
    );
    this.add(this._yTip);

    // Remove endpoint ticks that coincide with arrow tip bases
    const xTicks = this.xAxis.getTickMarks();
    if (xTicks.length > 0) {
      this.xAxis.remove(xTicks[xTicks.length - 1]);
    }
    const yTicks = this.yAxis.getTickMarks();
    if (yTicks.length > 0) {
      this.yAxis.remove(yTicks[yTicks.length - 1]);
    }
  }

  /**
   * Convert graph coordinates to visual point coordinates
   * @param x - X coordinate in graph space
   * @param y - Y coordinate in graph space
   * @returns The visual point [x, y, z]
   */
  /**
   * Alias for coordsToPoint (matches Python Manim's c2p shorthand)
   */
  c2p(x: number, y: number): Vector3Tuple {
    return this.coordsToPoint(x, y);
  }

  coordsToPoint(x: number, y: number): Vector3Tuple {
    const [xMin, xMax] = this._xRange;
    const [yMin, yMax] = this._yRange;

    // Calculate normalized position (0 to 1)
    const xNorm = xMax !== xMin ? (x - xMin) / (xMax - xMin) : 0.5;
    const yNorm = yMax !== yMin ? (y - yMin) / (yMax - yMin) : 0.5;

    // Convert to visual coordinates (centered at origin), then apply this
    // Axes' full transform (position, rotation, scale, and any ancestors') —
    // a plain position offset ignores rotation/scale applied via animations
    // like Rotate, so a transformed Axes would map coordinates as if it were
    // still in its original orientation (#534).
    const visualX = (xNorm - 0.5) * this._xLength;
    const visualY = (yNorm - 0.5) * this._yLength;

    return this._localToWorld([visualX, visualY, 0]);
  }

  /**
   * Convert visual point coordinates to graph coordinates
   * @param point - Visual point [x, y, z]
   * @returns The graph coordinates [x, y]
   */
  pointToCoords(point: Vector3Tuple): [number, number] {
    const [xMin, xMax] = this._xRange;
    const [yMin, yMax] = this._yRange;

    // Inverse of coordsToPoint's full transform (position, rotation, scale,
    // ancestors) — see #534.
    const [localX, localY] = this._worldToLocal(point);

    // Convert from visual to normalized (0 to 1)
    const xNorm = localX / this._xLength + 0.5;
    const yNorm = localY / this._yLength + 0.5;

    // Convert to graph coordinates
    const x = xNorm * (xMax - xMin) + xMin;
    const y = yNorm * (yMax - yMin) + yMin;

    return [x, y];
  }

  /**
   * Get the x-axis NumberLine
   */
  getXAxis(): NumberLine {
    return this.xAxis;
  }

  /**
   * Get the y-axis NumberLine
   */
  getYAxis(): NumberLine {
    return this.yAxis;
  }

  /**
   * Get the x range
   */
  getXRange(): [number, number, number] {
    return [...this._xRange];
  }

  /** Public accessor for x range (matches Python Manim's ax.x_range) */
  get xRange(): [number, number, number] {
    return [...this._xRange];
  }

  /**
   * Get the y range
   */
  getYRange(): [number, number, number] {
    return [...this._yRange];
  }

  /** Public accessor for y range (matches Python Manim's ax.y_range) */
  get yRange(): [number, number, number] {
    return [...this._yRange];
  }

  /**
   * Get the visual x length
   */
  getXLength(): number {
    return this._xLength;
  }

  /**
   * Get the visual y length
   */
  getYLength(): number {
    return this._yLength;
  }

  /**
   * Get the origin point in visual coordinates
   */
  getOrigin(): Vector3Tuple {
    return this.coordsToPoint(0, 0);
  }

  /**
   * Convert an x coordinate to visual x position
   */
  c2pX(x: number): number {
    return this.coordsToPoint(x, 0)[0];
  }

  /**
   * Convert a y coordinate to visual y position
   */
  c2pY(y: number): number {
    return this.coordsToPoint(0, y)[1];
  }

  /**
   * Plot a function on these axes, returning a FunctionGraph.
   * @param func - Function y = f(x)
   * @param options - Additional FunctionGraph options (color, strokeWidth, etc.)
   * @returns A FunctionGraph bound to these axes
   */
  plot(
    func: (x: number) => number,
    options: Partial<Omit<FunctionGraphOptions, 'func' | 'axes'>> = {},
  ): FunctionGraph {
    return new FunctionGraph({
      func,
      axes: this,
      ...options,
    });
  }

  /**
   * Get axis labels ("x" and "y" by default).
   * Labels can be LaTeX strings or pre-built Mobject instances (e.g. Tex, MathTex).
   * @param xLabel - LaTeX string or Mobject for x-axis label. Default: "x"
   * @param yLabel - LaTeX string or Mobject for y-axis label. Default: "y"
   * @returns A Group containing the two labels
   */
  getAxisLabels(
    xLabelOrOpts?: string | Mobject | { xLabel?: string | Mobject; yLabel?: string | Mobject },
    yLabelArg?: string | Mobject,
  ): Group {
    let xLabelInput: string | Mobject;
    let yLabelInput: string | Mobject;
    if (
      typeof xLabelOrOpts === 'object' &&
      xLabelOrOpts !== null &&
      !(xLabelOrOpts instanceof Mobject)
    ) {
      xLabelInput =
        (xLabelOrOpts as { xLabel?: string | Mobject; yLabel?: string | Mobject }).xLabel ?? 'x';
      yLabelInput =
        (xLabelOrOpts as { xLabel?: string | Mobject; yLabel?: string | Mobject }).yLabel ?? 'y';
    } else {
      xLabelInput = xLabelOrOpts ?? 'x';
      yLabelInput = yLabelArg ?? 'y';
    }

    const xLabelMob =
      xLabelInput instanceof Mobject
        ? xLabelInput
        : new MathTexImage({ latex: xLabelInput, fontSize: 32, color: '#ffffff' });
    const yLabelMob =
      yLabelInput instanceof Mobject
        ? yLabelInput
        : new MathTexImage({ latex: yLabelInput, fontSize: 32, color: '#ffffff' });

    // Position x label at the end of x-axis (UR direction from right end, matching Manim)
    const xEnd = this._xLength / 2;
    const xAxisY = this._numberToVisualY(0);
    xLabelMob.position.set(xEnd + 0.5, xAxisY + 0.35, 0);

    // Position y label at the top of y-axis (UR direction from top, matching Manim)
    const yAxisX = this._numberToVisualX(0);
    const yEnd = this._yLength / 2;
    yLabelMob.position.set(yAxisX + 0.55, yEnd + 0.35, 0);

    const group = new Group();
    group.add(xLabelMob);
    group.add(yLabelMob);
    return group;
  }

  /**
   * Get a label for a graph at a specific x-value.
   * Matches Python Manim's axes.get_graph_label() API.
   * @param graph - The FunctionGraph to label
   * @param label - LaTeX string for the label
   * @param options - Positioning options
   * @returns A MathTex label positioned near the graph
   */
  getGraphLabel(
    graph: FunctionGraph,
    labelOrOptions?:
      | string
      | {
          xVal?: number;
          direction?: Vector3Tuple;
          color?: string;
          label?: string;
        },
    options: {
      xVal?: number;
      direction?: Vector3Tuple;
      color?: string;
      label?: string;
    } = {},
  ): MathTexImage {
    // Handle overload: second arg can be a string label or an options object
    let opts = options;
    let label: string | undefined;
    if (typeof labelOrOptions === 'object' && labelOrOptions !== null) {
      opts = { ...labelOrOptions, ...options };
      label = undefined;
    } else {
      label = labelOrOptions;
    }
    const labelStr = label ?? opts.label ?? '';
    const xVal = opts.xVal ?? this._xRange[1];
    const direction = opts.direction ?? [1, 1, 0];
    const color = opts.color ?? graph.color;

    // Get the point on the graph at xVal
    const point = graph.getPointFromX(xVal);
    const pos: Vector3Tuple = point ?? this.coordsToPoint(xVal, 0);

    const labelMob = new MathTexImage({ latex: labelStr, fontSize: 32, color });
    // Offset by direction (scaled for readability)
    const dx = direction[0] * 0.5;
    const dy = direction[1] * 0.5;
    labelMob.position.set(pos[0] + dx, pos[1] + dy, pos[2]);

    return labelMob;
  }

  /**
   * Create a vertical line from the x-axis to a point.
   * @param point - The target point [x, y, z] in visual coordinates
   * @param options - Line options
   * @returns A Line from the x-axis to the point
   */
  getVerticalLine(
    point: Vector3Tuple,
    options: {
      color?: string;
      strokeWidth?: number;
      lineFunc?: typeof Line | typeof DashedLine;
    } = {},
  ): VMobject {
    const { color = '#ffffff', strokeWidth = 2, lineFunc = DashedLine } = options;
    const xAxisY = this.coordsToPoint(0, 0)[1];
    return new lineFunc({
      start: [point[0], xAxisY, point[2]] as Vector3Tuple,
      end: [point[0], point[1], point[2]] as Vector3Tuple,
      color,
      strokeWidth,
    });
  }

  /**
   * Input to graph point: convert an x value to the visual point on a graph.
   * Shorthand for graph.getPointFromX(x).
   * @param x - The x coordinate in graph space
   * @param graph - The FunctionGraph
   * @returns The visual coordinates on the graph
   */
  i2gp(x: number, graph: FunctionGraph): Vector3Tuple {
    const point = graph.getPointFromX(x);
    return point ?? this.coordsToPoint(x, 0);
  }

  /**
   * Alias for i2gp — convert an x value to the visual point on a graph.
   * Matches Python Manim's axes.input_to_graph_point() API.
   */
  inputToGraphPoint(x: number, graph: FunctionGraph): Vector3Tuple {
    return this.i2gp(x, graph);
  }

  /**
   * Create Riemann sum rectangles under a graph.
   * @param graph - The FunctionGraph to approximate
   * @param options - Riemann rectangle options
   * @returns A VGroup of filled rectangles
   */
  getRiemannRectangles(
    graph: FunctionGraph,
    options: {
      xRange?: [number, number];
      dx?: number;
      color?: string;
      fillOpacity?: number;
      strokeWidth?: number;
      strokeColor?: string;
    } = {},
  ): VGroup {
    const {
      xRange,
      dx = 0.1,
      color = '#58c4dd',
      fillOpacity = 0.5,
      strokeWidth = 1,
      strokeColor = color,
    } = options;

    const [xStart, xEnd] = xRange ?? [this._xRange[0], this._xRange[1]];
    const func = graph.getFunction();
    const group = new VGroup();

    for (let x = xStart; x < xEnd - dx * 0.001; x += dx) {
      const y = func(x);
      if (!isFinite(y) || isNaN(y)) continue;

      // Rectangle corners in visual coordinates
      const bl = this.coordsToPoint(x, 0);
      const br = this.coordsToPoint(x + dx, 0);
      const tr = this.coordsToPoint(x + dx, y);
      const tl = this.coordsToPoint(x, y);

      const rect = new VMobject();
      rect.color = strokeColor;
      rect.fillColor = color;
      rect.fillOpacity = fillOpacity;
      rect.strokeWidth = strokeWidth;

      // Build closed rectangle path as degenerate cubic Bezier segments
      const points: number[][] = [];
      const addSeg = (p0: number[], p1: number[], first: boolean) => {
        const ddx = p1[0] - p0[0];
        const ddy = p1[1] - p0[1];
        const ddz = p1[2] - p0[2];
        if (first) points.push([...p0]);
        points.push([p0[0] + ddx / 3, p0[1] + ddy / 3, p0[2] + ddz / 3]);
        points.push([p0[0] + (2 * ddx) / 3, p0[1] + (2 * ddy) / 3, p0[2] + (2 * ddz) / 3]);
        points.push([...p1]);
      };
      addSeg(bl, tl, true);
      addSeg(tl, tr, false);
      addSeg(tr, br, false);
      addSeg(br, bl, false);

      rect.setPoints3D(points);
      group.add(rect);
    }

    return group;
  }

  /**
   * Create a filled area between a graph and either the x-axis or another graph.
   * @param graph - The primary graph boundary
   * @param xRange - The x interval [start, end]
   * @param options - Area options
   * @returns A filled VMobject representing the area
   */
  getArea(
    graph: FunctionGraph,
    xRange: [number, number],
    options: {
      boundedGraph?: FunctionGraph;
      color?: string;
      opacity?: number;
      strokeWidth?: number;
    } = {},
  ): VMobject {
    const { boundedGraph, color = '#888888', opacity = 0.5, strokeWidth = 0 } = options;

    const [xStart, xEnd] = xRange;
    const numSamples = 100;
    const dx = (xEnd - xStart) / numSamples;
    const func1 = graph.getFunction();

    const area = new VMobject();
    area.color = color;
    area.fillColor = color;
    area.fillOpacity = opacity;
    area.strokeWidth = strokeWidth;

    // Forward path along the main graph
    const forwardPoints: number[][] = [];
    for (let i = 0; i <= numSamples; i++) {
      const x = xStart + i * dx;
      const y = func1(x);
      if (isFinite(y) && !isNaN(y)) {
        forwardPoints.push(this.coordsToPoint(x, y));
      }
    }

    // Backward path along bounded graph or x-axis
    const backwardPoints: number[][] = [];
    if (boundedGraph) {
      const func2 = boundedGraph.getFunction();
      for (let i = numSamples; i >= 0; i--) {
        const x = xStart + i * dx;
        const y = func2(x);
        if (isFinite(y) && !isNaN(y)) {
          backwardPoints.push(this.coordsToPoint(x, y));
        }
      }
    } else {
      // Use x-axis (y = 0)
      for (let i = numSamples; i >= 0; i--) {
        const x = xStart + i * dx;
        backwardPoints.push(this.coordsToPoint(x, 0));
      }
    }

    // Combine into closed polygon
    const allPoints = [...forwardPoints, ...backwardPoints];
    if (allPoints.length < 3) return area;

    // Close the polygon back to start
    allPoints.push([...allPoints[0]]);

    // Convert to cubic Bezier segments (degenerate — straight lines)
    const bezierPoints: number[][] = [];
    for (let i = 0; i < allPoints.length - 1; i++) {
      const p0 = allPoints[i];
      const p1 = allPoints[i + 1];
      const ddx = p1[0] - p0[0];
      const ddy = p1[1] - p0[1];
      const ddz = p1[2] - p0[2];
      if (i === 0) bezierPoints.push([...p0]);
      bezierPoints.push([p0[0] + ddx / 3, p0[1] + ddy / 3, p0[2] + ddz / 3]);
      bezierPoints.push([p0[0] + (2 * ddx) / 3, p0[1] + (2 * ddy) / 3, p0[2] + (2 * ddz) / 3]);
      bezierPoints.push([...p1]);
    }

    area.setPoints3D(bezierPoints);
    return area;
  }

  /**
   * Plot a line graph connecting data points with straight line segments.
   * Returns a VDict with "line_graph" (the connecting line) and
   * "vertex_dots" (dots at each data point).
   *
   * Matches Python Manim's axes.plot_line_graph() API.
   *
   * @param options - Line graph options
   * @returns A VDict with "line_graph" and "vertex_dots" entries
   */
  plotLineGraph(options: {
    xValues: number[];
    yValues: number[];
    lineColor?: string;
    addVertexDots?: boolean;
    vertexDotRadius?: number;
    vertexDotStyle?: {
      color?: string;
      fillOpacity?: number;
      strokeWidth?: number;
      strokeColor?: string;
    };
    strokeWidth?: number;
  }): VDict {
    const {
      xValues,
      yValues,
      lineColor = '#fcff00', // YELLOW_C
      addVertexDots = true,
      vertexDotRadius = 0.08,
      vertexDotStyle = {},
      strokeWidth = 2,
    } = options;

    const result = new VDict();

    // Build the connecting line as a VMobject with straight segments
    if (xValues.length >= 2) {
      const lineMob = new VMobject();
      lineMob.color = lineColor;
      lineMob.fillOpacity = 0;
      lineMob.strokeWidth = strokeWidth;

      const points: number[][] = [];
      for (let i = 0; i < xValues.length - 1; i++) {
        const p0 = this.coordsToPoint(xValues[i], yValues[i]);
        const p1 = this.coordsToPoint(xValues[i + 1], yValues[i + 1]);
        const dx = p1[0] - p0[0];
        const dy = p1[1] - p0[1];
        const dz = p1[2] - p0[2];
        if (i === 0) points.push([...p0]);
        points.push([p0[0] + dx / 3, p0[1] + dy / 3, p0[2] + dz / 3]);
        points.push([p0[0] + (2 * dx) / 3, p0[1] + (2 * dy) / 3, p0[2] + (2 * dz) / 3]);
        points.push([...p1]);
      }
      lineMob.setPoints3D(points);
      result.set('line_graph', lineMob);
    }

    // Build vertex dots (default color is white, matching Manim's Dot default)
    if (addVertexDots) {
      const dotsGroup = new VGroup();
      const dotColor = vertexDotStyle.color ?? '#ffffff';
      for (let i = 0; i < xValues.length; i++) {
        const pt = this.coordsToPoint(xValues[i], yValues[i]);
        const dot = new Dot({
          point: pt,
          radius: vertexDotRadius,
          color: dotColor,
          fillOpacity: vertexDotStyle.fillOpacity ?? 1,
          strokeWidth: vertexDotStyle.strokeWidth ?? 0,
        });
        if (vertexDotStyle.strokeColor) {
          dot.color = vertexDotStyle.strokeColor;
          dot.strokeWidth = vertexDotStyle.strokeWidth ?? 2;
        }
        dotsGroup.add(dot);
      }
      result.set('vertex_dots', dotsGroup);
    }

    return result;
  }

  private _numberToVisualX(x: number): number {
    const [min, max] = this._xRange;
    const range = max - min;
    if (range === 0) return 0;
    return ((x - min) / range - 0.5) * this._xLength;
  }

  private _numberToVisualY(y: number): number {
    const [min, max] = this._yRange;
    const range = max - min;
    if (range === 0) return 0;
    return ((y - min) / range - 0.5) * this._yLength;
  }

  override copy(): Axes {
    const copy = new Axes({
      xRange: this._xRange,
      yRange: this._yRange,
      xLength: this._xLength,
      yLength: this._yLength,
      tips: this._tips,
      tipLength: this._tipLength,
    });
    this._copyBaseAttributesInto(copy, { copyChildren: false });
    return copy;
  }
}
