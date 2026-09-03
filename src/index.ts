// Re-export the bundled three.js instance so consumers (e.g. the /browser
// build) can share it instead of loading a second, incompatible copy.
export * as THREE from 'three';

// Colors
export * from './constants/colors';
export {
  DEFAULT_STROKE_WIDTH,
  DEFAULT_FONT_SIZE,
  DEFAULT_ANIMATION_DURATION,
  DEFAULT_FRAME_WIDTH,
  DEFAULT_FRAME_HEIGHT,
  DEFAULT_PIXEL_WIDTH,
  DEFAULT_PIXEL_HEIGHT,
  DEFAULT_FPS,
  SMALL_BUFF,
  MED_SMALL_BUFF,
  MED_LARGE_BUFF,
  LARGE_BUFF,
  DEFAULT_MOBJECT_TO_EDGE_BUFFER,
  DEFAULT_MOBJECT_TO_MOBJECT_BUFFER,
} from './constants';

// TeX Templates
export {
  TexTemplate,
  TexFontTemplates,
  TexTemplateLibrary,
  type TexTemplateOptions,
} from './utils/tex-templates';

// Core
export {
  Mobject,
  type MobjectStyle,
  type Vector3Tuple,
  type UpdaterFunction,
} from './core/Mobject';
export { AnimateProxy } from './core/AnimateProxy';
export { UP, DOWN, LEFT, RIGHT, IN, OUT, ORIGIN, UL, UR, DL, DR } from './core/Mobject';
export { VMobject, type Point } from './core/VMobject';
export { VGroup } from './core/VGroup';
export { VDict, VectorizedPoint } from './core/VDict';
export { Group } from './core/Group';
export { Scene, type SceneOptions, type SceneExportOptions } from './core/Scene';
export { InteractiveScene, type InteractiveSceneOptions } from './core/InteractiveScene';
export { ThreeDScene, type ThreeDSceneOptions } from './core/ThreeDScene';
export { ZoomedScene, ZoomDisplayPopOut, type ZoomedSceneOptions } from './core/ZoomedScene';
export { MovingCameraScene, type MovingCameraSceneOptions } from './core/MovingCameraScene';
export { VectorScene, type VectorSceneOptions } from './core/VectorScene';
export {
  LinearTransformationScene,
  type LinearTransformationSceneOptions,
  type Matrix2D,
} from './core/LinearTransformationScene';
export { AudioManager, type AudioTrack, type AddSoundOptions } from './core/AudioManager';
export { Renderer, type RendererOptions, type IRenderer } from './core/Renderer';
export { NullRenderer } from './core/NullRenderer';
export {
  SceneStateManager,
  serializeMobject,
  deserializeMobject,
  saveMobjectState,
  restoreMobjectState,
  stateToJSON,
  stateFromJSON,
  snapshotToJSON,
  snapshotFromJSON,
  type MobjectState,
  type SceneSnapshot,
} from './core/StateManager';
export {
  Camera2D,
  type CameraOptions,
  type Camera2DAspectMode,
  Camera3D,
  type Camera3DOptions,
} from './core/Camera';
export { Camera2DFrame } from './core/Camera2DFrame';
export {
  MovingCamera,
  ThreeDCamera,
  MultiCamera,
  MappingCamera,
  SplitScreenCamera,
  type MovingCameraOptions,
  type ThreeDCameraOptions,
  type CameraViewport,
  type CameraEntry,
  type MultiCameraOptions,
  type MappingCameraOptions,
  type MappingFunction,
  type SplitScreenCameraOptions,
} from './core/CameraExtensions';
export {
  CameraFrame,
  CameraAnimateProxy,
  type CameraFrameOptions,
  type CameraFrameState,
  type CameraAnimationOptions,
} from './core/CameraFrame';
export {
  Lighting,
  type AmbientLightOptions,
  type DirectionalLightOptions,
  type PointLightOptions,
  type SpotLightOptions,
} from './core/Lighting';

// Geometry
export {
  Circle,
  type CircleOptions,
  Line,
  type LineOptions,
  Rectangle,
  Square,
  type RectangleOptions,
  Polygon,
  Triangle,
  RegularPolygon,
  Hexagon,
  Pentagon,
  type PolygonOptions,
  Polygram,
  type PolygramOptions,
  TipableVMobject,
  type TipableVMobjectOptions,
  type TipOptions,
  Arrow,
  DoubleArrow,
  Vector,
  type ArrowOptions,
  Arc,
  type ArcOptions,
  ArcBetweenPoints,
  type ArcBetweenPointsOptions,
  // Arc-based shapes
  Ellipse,
  type EllipseOptions,
  Annulus,
  type AnnulusOptions,
  AnnularSector,
  type AnnularSectorOptions,
  Sector,
  type SectorOptions,
  ArcPolygon,
  type ArcPolygonOptions,
  type ArcConfig,
  CurvedArrow,
  CurvedDoubleArrow,
  type CurvedArrowOptions,
  TangentialArc,
  type TangentialArcOptions,
  DashedLine,
  type DashedLineOptions,
  DashedVMobject,
  type DashedVMobjectOptions,
  CubicBezier,
  type CubicBezierOptions,
  Dot,
  SmallDot,
  LargeDot,
  type DotOptions,
  BackgroundRectangle,
  SurroundingRectangle,
  Underline,
  Cross,
  type BackgroundRectangleOptions,
  type SurroundingRectangleOptions,
  type UnderlineOptions,
  type CrossOptions,
  // Extended polygon shapes
  RoundedRectangle,
  type RoundedRectangleOptions,
  Star,
  type StarOptions,
  RegularPolygram,
  type RegularPolygramOptions,
  Cutout,
  type CutoutOptions,
  ConvexHull,
  type ConvexHullOptions,
  // Angle shapes
  Angle,
  RightAngle,
  Elbow,
  TangentLine,
  type AngleOptions,
  type AngleInput,
  type RightAngleOptions,
  type ElbowOptions,
  type TangentLineOptions,
  // Arrow tips
  ArrowTip,
  ArrowTriangleTip,
  ArrowTriangleFilledTip,
  ArrowCircleTip,
  ArrowCircleFilledTip,
  ArrowSquareTip,
  ArrowSquareFilledTip,
  StealthTip,
  type ArrowTipOptions,
  // Cubic bezier points type
  type CubicBezierPoints,
  // Boolean operations
  Union,
  Intersection,
  Difference,
  Exclusion,
  BooleanResult,
  union,
  intersection,
  difference,
  exclusion,
  type BooleanOperationOptions,
  // Labeled geometry
  LabeledPolygram,
  type LabeledPolygramOptions,
  LabeledLine,
  LabeledArrow,
  LabeledDot,
  AnnotationDot,
  type LabeledLineOptions,
  type LabeledArrowOptions,
  type LabeledDotOptions,
  type AnnotationDotOptions,
  type LabelDirection,
  type LabelOrientation,
} from './mobjects/geometry';

// Graphing
export {
  NumberLine,
  type NumberLineOptions,
  UnitInterval,
  type UnitIntervalOptions,
  Axes,
  type AxesOptions,
  NumberPlane,
  type NumberPlaneOptions,
  type BackgroundLineStyle,
  FunctionGraph,
  type FunctionGraphOptions,
  ImplicitFunction,
  type ImplicitFunctionOptions,
  ParametricFunction,
  type ParametricFunctionOptions,
  VectorFieldVector,
  type VectorFieldVectorOptions,
  ComplexPlane,
  type ComplexPlaneOptions,
  PolarPlane,
  type PolarPlaneOptions,
  BarChart,
  type BarChartOptions,
  VectorField,
  ArrowVectorField,
  StreamLines,
  type VectorFunction,
  type ColorFunction,
  type VectorFieldBaseOptions,
  type ArrowVectorFieldOptions,
  type StreamLinesOptions,
  type ContinuousMotionOptions,
} from './mobjects/graphing';

// Text and LaTeX
export {
  Text,
  type TextOptions,
  Paragraph,
  type ParagraphOptions,
  MarkupText,
  type MarkupTextOptions,
  // MathTex - SVG vector-based (default, like Python Manim)
  MathTex,
  type MathTexOptions,
  // MathTexSVG - deprecated alias for MathTex (backwards compat)
  MathTexSVG,
  type MathTexSVGOptions,
  // MathTexImage - rasterized texture-based renderer
  MathTexImage,
  type MathTexImageOptions,
  type TexRenderer,
  Tex,
  type TexOptions,
  ensureKatexStyles,
  areKatexStylesLoaded,
  setKatexStylesheetUrl,
  // MathJax renderer (full LaTeX support, dynamic import)
  renderLatexToSVG,
  preloadMathJax,
  isMathJaxLoaded,
  katexCanRender,
  setMathJaxScriptUrl,
  type MathJaxRenderOptions,
  type MathJaxRenderResult,
  // SVG path parser
  parseSVGPathData,
  svgToVMobjects,
  type SVGToVMobjectOptions,
  DecimalNumber,
  Integer,
  type DecimalNumberOptions,
  Variable,
  type VariableOptions,
  GlyphVMobject,
  type GlyphVMobjectOptions,
  TextGlyphGroup,
  type TextGlyphGroupOptions,
  // Code blocks
  Code,
  type CodeOptions,
  type CodeColorScheme,
  type Token,
  type TokenType,
  DEFAULT_COLOR_SCHEME,
  MONOKAI_COLOR_SCHEME,
  // MathTexParts
  SingleStringMathTex,
  type SingleStringMathTexOptions,
  MathTexPart,
  type MathTexPartOptions,
  // Extended text
  BulletedList,
  Title,
  MarkdownText,
  type BulletedListOptions,
  type TitleOptions,
  type MarkdownTextOptions,
  type StyledTextSegment,
} from './mobjects/text';

// 3D Mobjects
export {
  // Shared 3D mesh base class
  Mobject3D,
  // Basic 3D primitives
  Sphere,
  type SphereOptions,
  Cube,
  Box3D,
  type CubeOptions,
  type Box3DOptions,
  Cylinder,
  Cone,
  type CylinderOptions,
  type ConeOptions,
  Torus,
  type TorusOptions,
  // Lines and arrows
  Line3D,
  type Line3DOptions,
  Arrow3D,
  Vector3D,
  type Arrow3DOptions,
  // Surfaces
  Surface3D,
  type Surface3DOptions,
  ParametricSurface,
  SurfacePresets,
  type ParametricSurfaceOptions,
  // Textured surfaces
  TexturedSurface,
  texturedSphere,
  type TexturedSurfaceOptions,
  type TexturedSphereOptions,
  // Coordinate systems
  ThreeDAxes,
  type ThreeDAxesOptions,
  // Platonic solids
  Polyhedron,
  Tetrahedron,
  Octahedron,
  Icosahedron,
  Dodecahedron,
  type PolyhedronOptions,
  type TetrahedronOptions,
  type OctahedronOptions,
  type IcosahedronOptions,
  type DodecahedronOptions,
  // Additional 3D primitives
  Prism,
  Dot3D,
  ThreeDVMobject,
  type PrismOptions,
  type Dot3DOptions,
  type ThreeDVMobjectOptions,
  // Convex hull
  ConvexHull3D,
  type ConvexHull3DOptions,
} from './mobjects/three-d';

// Value Trackers
export {
  ValueTracker,
  valueTracker,
  ComplexValueTracker,
  complexValueTracker,
  type ValueTrackerOptions,
  type ComplexValueTrackerOptions,
  type Complex,
} from './mobjects/value-tracker';

// Matrix
export {
  Matrix,
  IntegerMatrix,
  DecimalMatrix,
  MobjectMatrix,
  type MatrixOptions,
  type IntegerMatrixOptions,
  type DecimalMatrixOptions,
  type MobjectMatrixOptions,
  type BracketType,
  type ElementAlignment,
  getDetText,
  matrixToMobject,
  matrixToTexString,
  type GetDetTextOptions,
} from './mobjects/matrix';

// Logo
export { ManimBanner, type ManimBannerOptions } from './mobjects/logo';

// Table
export {
  Table,
  MathTable,
  MobjectTable,
  IntegerTable,
  DecimalTable,
  type TableOptions,
  type MathTableOptions,
  type MobjectTableOptions,
  type IntegerTableOptions,
  type DecimalTableOptions,
} from './mobjects/table';

// SVG-based mobjects (Braces)
export {
  Brace,
  BraceBetweenPoints,
  ArcBrace,
  BraceLabel,
  BraceText,
  type BraceOptions,
  type BraceBetweenPointsOptions,
  type ArcBraceOptions,
  type BraceLabelOptions,
  // SVG parsing
  SVGMobject,
  svgMobject,
  VMobjectFromSVGPath,
  type SVGMobjectOptions,
  type VMobjectFromSVGPathOptions,
} from './mobjects/svg';

// Graph mobjects for network visualization
export {
  // Core graph classes
  GenericGraph,
  Graph,
  DiGraph,
  // Types
  type VertexId,
  type EdgeTuple,
  type LayoutType,
  type VertexStyleOptions,
  type EdgeStyleOptions,
  type VertexConfig,
  type EdgeConfig,
  type LayoutConfig,
  type GenericGraphOptions,
  type DiGraphOptions,
  // Layout algorithms
  computeLayout,
  computeCircularLayout,
  // Helper functions for common graph types
  completeGraph,
  cycleGraph,
  pathGraph,
  starGraph,
  binaryTree,
  gridGraph,
  bipartiteGraph,
} from './mobjects/graph';

// Image mobjects
export { ImageMobject, type ImageMobjectOptions, type ImageFilterOptions } from './mobjects/image';

// Frame/Screen mobjects
export {
  ScreenRectangle,
  type ScreenRectangleOptions,
  FullScreenRectangle,
  type FullScreenRectangleOptions,
  FullScreenFadeRectangle,
  type FullScreenFadeRectangleOptions,
  createFadeToBlack,
  createFadeToWhite,
  DEFAULT_ASPECT_RATIO,
} from './mobjects/frame';

// Point-based mobjects (particles)
export {
  PMobject,
  PGroup,
  PointMobject,
  PointCloudDot,
  type PMobjectOptions,
  type PGroupOptions,
  type PointMobjectOptions,
  type PointCloudDotOptions,
  type PointData,
  Mobject1D,
  type Mobject1DOptions,
  Mobject2D,
  type Mobject2DOptions,
  type Distribution2D,
} from './mobjects/point';

// Fractal mobjects
export {
  MandelbrotSet,
  type MandelbrotSetOptions,
  NewtonFractal,
  type NewtonFractalOptions,
} from './mobjects/fractals';

// Probability mobjects
export {
  SampleSpace,
  type SampleSpaceOptions,
  type Partition,
  type DivideOptions,
  type BraceAnnotationOptions,
  DiceFace,
  createDiceRow,
  type DiceFaceOptions,
} from './mobjects/probability';

// Animations
export { Animation, type AnimationOptions, type RateFunction } from './animation/Animation';
export { Timeline, type PositionParam } from './animation/Timeline';
export {
  MasterTimeline,
  masterTimeline,
  type Segment,
  type Slide,
  type SlideOptions,
} from './animation/MasterTimeline';

// Animation types
export { FadeIn, fadeIn, FadeOut, fadeOut } from './animation/fading';
export {
  Create,
  create,
  DrawBorderThenFill,
  drawBorderThenFill,
  Uncreate,
  uncreate,
  Write,
  write,
  Unwrite,
  unwrite,
  AddTextLetterByLetter,
  addTextLetterByLetter,
  RemoveTextLetterByLetter,
  removeTextLetterByLetter,
  AddTextWordByWord,
  addTextWordByWord,
  type AddTextWordByWordOptions,
  ShowIncreasingSubsets,
  showIncreasingSubsets,
  type ShowIncreasingSubsetsOptions,
  ShowPartial,
  showPartial,
  type ShowPartialOptions,
  ShowSubmobjectsOneByOne,
  showSubmobjectsOneByOne,
  type ShowSubmobjectsOneByOneOptions,
  SpiralIn,
  spiralIn,
  type SpiralInOptions,
  TypeWithCursor,
  typeWithCursor,
  UntypeWithCursor,
  untypeWithCursor,
  type TypeWithCursorOptions,
  type UntypeWithCursorOptions,
  type CreateOptions,
  type WriteOptions,
  type AddTextLetterByLetterOptions,
} from './animation/creation';
export {
  Transform,
  transform,
  ReplacementTransform,
  replacementTransform,
  MoveToTarget,
  moveToTarget,
} from './animation/transform';
export {
  ApplyPointwiseFunction,
  applyPointwiseFunction,
  type ApplyPointwiseFunctionOptions,
} from './animation/transform';
export {
  ApplyPointwiseFunctionToCenter,
  applyPointwiseFunctionToCenter,
  type ApplyPointwiseFunctionToCenterOptions,
} from './animation/transform';
export { ApplyFunction, applyFunction, type ApplyFunctionOptions } from './animation/transform';
export { ApplyMethod, applyMethod, type ApplyMethodOptions } from './animation/transform';
export { ApplyMatrix, applyMatrix, type ApplyMatrixOptions } from './animation/transform';
export {
  ApplyComplexFunction,
  applyComplexFunction,
  type ApplyComplexFunctionOptions,
} from './animation/transform';
export {
  FadeTransform,
  fadeTransform,
  type FadeTransformOptions,
  FadeTransformPieces,
  fadeTransformPieces,
  type FadeTransformPiecesOptions,
  TransformFromCopy,
  transformFromCopy,
  type TransformFromCopyOptions,
} from './animation/transform';
export {
  ClockwiseTransform,
  clockwiseTransform,
  type ClockwiseTransformOptions,
  CounterclockwiseTransform,
  counterclockwiseTransform,
  type CounterclockwiseTransformOptions,
  Swap,
  swap,
  type SwapOptions,
  CyclicReplace,
  cyclicReplace,
  type CyclicReplaceOptions,
} from './animation/transform';
export { FadeToColor, fadeToColor, type FadeToColorOptions } from './animation/transform';
export {
  Restore,
  restore,
  type MobjectWithSavedState,
  type RestoreOptions,
} from './animation/transform';
export {
  ScaleInPlace,
  scaleInPlace,
  type ScaleInPlaceOptions,
  ShrinkToCenter,
  shrinkToCenter,
  type ShrinkToCenterOptions,
} from './animation/transform';
export {
  TransformMatchingAbstractBase,
  type TransformMatchingBaseOptions,
} from './animation/transform';
export {
  TransformMatchingShapes,
  transformMatchingShapes,
  type TransformMatchingShapesOptions,
  TransformMatchingTex,
  transformMatchingTex,
  type TransformMatchingTexOptions,
} from './animation/transform';
export {
  TransformAnimations,
  transformAnimations,
  type TransformAnimationsOptions,
} from './animation/transform';
export { type MobjectWithTarget } from './animation/transform';

// Movement animations
export {
  Rotate,
  rotate,
  type RotateOptions,
  Scale,
  scale,
  GrowFromCenter,
  growFromCenter,
  type ScaleOptions,
  type GrowFromCenterOptions,
  Shift,
  shift,
  MoveToTargetPosition,
  moveToTargetPosition,
  type ShiftOptions,
  type MoveToTargetPositionOptions,
  type MobjectWithTargetPosition,
  MoveAlongPath,
  moveAlongPath,
  type MoveAlongPathOptions,
  // Homotopy animations
  Homotopy,
  homotopy,
  ComplexHomotopy,
  complexHomotopy,
  SmoothedVectorizedHomotopy,
  smoothedVectorizedHomotopy,
  PhaseFlow,
  phaseFlow,
  type HomotopyFunction,
  type ComplexHomotopyFunction,
  type VectorFieldFunction,
  type HomotopyOptions,
  type ComplexHomotopyOptions,
  type SmoothedVectorizedHomotopyOptions,
  type PhaseFlowOptions,
} from './animation/movement';

// Growing animations
export {
  GrowArrow,
  growArrow,
  type GrowArrowOptions,
  GrowFromEdge,
  growFromEdge,
  type GrowFromEdgeOptions,
  GrowFromPoint,
  growFromPoint,
  type GrowFromPointOptions,
  SpinInFromNothing,
  spinInFromNothing,
  type SpinInFromNothingOptions,
} from './animation/growing';

// Animation utilities
export {
  AnimationGroup,
  animationGroup,
  type AnimationGroupOptions,
} from './animation/AnimationGroup';
export { LaggedStart, laggedStart, type LaggedStartOptions } from './animation/LaggedStart';
export { Succession, succession, type SuccessionOptions } from './animation/Succession';
export {
  LaggedStartMap,
  laggedStartMap,
  type LaggedStartMapOptions,
  type AnimationClass,
} from './animation/composition';

// Animation override & prepare utilities
export {
  overrideAnimation,
  getAnimationOverride,
  hasAnimationOverride,
  clearAnimationOverrides,
  prepareAnimation,
  type AnimationOverrideFunc,
} from './animation/AnimationUtilities';

// Updater animations
export { UpdateFromFunc, updateFromFunc } from './animation/UpdateFromFunc';
export { UpdateFromAlphaFunc, updateFromAlphaFunc } from './animation/UpdateFromAlphaFunc';
export { maintainPositionRelativeTo } from './animation/MaintainPositionRelativeTo';

// Number animations
export {
  ChangingDecimal,
  changingDecimal,
  type ChangingDecimalOptions,
  ChangeDecimalToValue,
  changeDecimalToValue,
  type ChangeDecimalToValueOptions,
} from './animation/numbers';

// Changing animations (path tracing, animated boundaries)
export {
  TracedPath,
  tracedPath,
  type TracedPathOptions,
  AnimatedBoundary,
  animatedBoundary,
  type AnimatedBoundaryOptions,
} from './animation/changing';

// Speed animations
export {
  ChangeSpeed,
  changeSpeed,
  type ChangeSpeedOptions,
  type SpeedFunction,
  linearSpeedRamp,
  emphasizeRegion,
  rushRegion,
  smoothSpeedCurve,
} from './animation/speed';

// Utility animations
export {
  Add,
  add,
  type AddOptions,
  Remove,
  remove,
  type RemoveOptions,
  Wait,
  wait,
  type WaitOptions,
  Rotating,
  rotating,
  type RotatingOptions,
  Broadcast,
  broadcast,
  type BroadcastOptions,
} from './animation/utility';

// Indication animations
export {
  Indicate,
  indicate,
  type IndicateOptions,
  Flash,
  flash,
  type FlashOptions,
  Circumscribe,
  circumscribe,
  type CircumscribeOptions,
  type CircumscribeShape,
  Wiggle,
  wiggle,
  type WiggleOptions,
  ShowPassingFlash,
  showPassingFlash,
  type ShowPassingFlashOptions,
  ApplyWave,
  applyWave,
  type ApplyWaveOptions,
  type WaveDirection,
  FocusOn,
  focusOn,
  type FocusOnOptions,
  Pulse,
  pulse,
  type PulseOptions,
  ShowCreationThenDestruction,
  showCreationThenDestruction,
  type ShowCreationThenDestructionOptions,
  WiggleOutThenIn,
  wiggleOutThenIn,
  type WiggleOutThenInOptions,
  // ShowPassingFlashWithThinningStrokeWidth
  ShowPassingFlashWithThinningStrokeWidth,
  showPassingFlashWithThinningStrokeWidth,
  type ShowPassingFlashWithThinningStrokeWidthOptions,
  // Blink
  Blink,
  blink,
  type BlinkOptions,
} from './animation/indication';

// Rate functions
export {
  linear,
  smooth,
  easeIn,
  easeOut,
  easeInOut,
  easeInQuad,
  easeOutQuad,
  easeInExpo,
  easeOutExpo,
  easeInBounce,
  easeOutBounce,
  thereAndBack,
  rushInto,
  rushFrom,
  doubleSmooth,
  stepFunction,
  reverse,
  compose,
  slowInto,
  squishRateFunc,
  thereAndBackWithPause,
  runningStart,
  wiggle as wiggleRate,
  notQuiteThere,
  lingering,
  exponentialDecay,
  // Smoothstep family
  smoothstep,
  smootherstep,
  smoothererstep,
  // Sine easing
  easeInSine,
  easeOutSine,
  easeInOutSine,
  // Quad InOut
  easeInOutQuad,
  // Quart easing
  easeInQuart,
  easeOutQuart,
  easeInOutQuart,
  // Quint easing
  easeInQuint,
  easeOutQuint,
  easeInOutQuint,
  // Expo InOut
  easeInOutExpo,
  // Circ easing
  easeInCirc,
  easeOutCirc,
  easeInOutCirc,
  // Back easing
  easeInBack,
  easeOutBack,
  easeInOutBack,
  // Elastic easing
  easeInElastic,
  easeOutElastic,
  easeInOutElastic,
  // Bounce InOut
  easeInOutBounce,
  // Python Manim-compatible aliases
  easeInCubic,
  easeOutCubic,
  easeInOutCubic,
} from './rate-functions';

// Interaction - UI Controls
export {
  Controls,
  type ControlsOptions,
  type ControlsPosition,
  type ControlsTheme,
  type SliderConfig,
  type ButtonConfig,
  type CheckboxConfig,
  type ColorPickerConfig,
  PlaybackControls,
  type PlaybackControlsOptions,
  type TimeUpdateCallback,
} from './interaction';

// Interaction - Mobject Behaviors
export {
  Draggable,
  makeDraggable,
  type DraggableOptions,
  Hoverable,
  makeHoverable,
  type HoverableOptions,
  Clickable,
  makeClickable,
  type ClickableOptions,
} from './interaction';

// Interaction - Selection
export { SelectionManager, type SelectionManagerOptions } from './interaction';

// Interaction - Camera Controls
export { OrbitControls, type OrbitControlsOptions } from './interaction';

// Export
export {
  GifExporter,
  createGifExporter,
  type GifExportOptions,
  VideoExporter,
  createVideoExporter,
  type VideoExportOptions,
} from './export';

// Vector math utilities
export {
  scaleVec,
  addVec,
  subVec,
  linspace,
  dotVec,
  crossVec,
  lengthVec,
  normalizeVec,
  unitPerpendicularTo,
  orthonormalFrame,
  orientation2D,
} from './utils/vectors';

// Player
export { Player, type PlayerOptions } from './player';
export { PlayerUI, type PlayerUIOptions, type PlayerUICallbacks } from './player';
export { PlayerController, type PlayerControllerCallbacks } from './player';

// Feature flags
export {
  isFeatureEnabled,
  setFeatureFlags,
  resetFeatureFlags,
  getFeatureFlags,
} from './utils/featureFlags';

// Logging
export { logger, onLog, type LogEntry, type LogLevel, type LogListener } from './utils/logger';
