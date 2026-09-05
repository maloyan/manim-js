import * as THREE from 'three';
import { VMobject } from '../../core/VMobject';
import {
  collectLeafVMobjectSnapshots,
  type LeafVMobjectSnapshot,
} from '../../core/MobjectTraversal';
import { alignCompoundPathsForTransform } from '../../core/VMobjectTransformAlignment';

function sum(values: number[]): number {
  let out = 0;
  for (const v of values) out += v;
  return out;
}

function assertSubpathLengthsMatchPoints(
  points: number[][],
  lengths: number[] | undefined,
  label: string,
): void {
  if (!lengths || lengths.length === 0) return;
  const total = sum(lengths);
  if (total !== points.length) {
    throw new Error(
      `${label}: subpath lengths sum (${total}) does not match point count (${points.length})`,
    );
  }
}

export interface AlignedTransformPair {
  startPoints: number[][];
  targetPoints: number[][];
  alignedSubpathLengths?: number[];
  finalTargetPoints: number[][];
  finalTargetSubpathLengths?: number[];
}

export function alignVmobjectPair(source: VMobject, target: VMobject): AlignedTransformPair {
  const startCopy = source.copy() as VMobject;
  const targetCopy = target.copy() as VMobject;

  const finalTargetPoints = targetCopy.getLocalPoints();
  const finalTargetSubpathLengths =
    targetCopy.getEffectiveSubpathLengths?.() ?? target.getEffectiveSubpathLengths?.();

  const srcLengths =
    startCopy.getEffectiveSubpathLengths?.() ?? source.getEffectiveSubpathLengths?.();
  const tgtLengths = finalTargetSubpathLengths;

  const startPointsRaw = startCopy.getLocalPoints();
  const targetPointsRaw = targetCopy.getLocalPoints();

  assertSubpathLengthsMatchPoints(startPointsRaw, srcLengths, 'alignVmobjectPair(source)');
  assertSubpathLengthsMatchPoints(targetPointsRaw, tgtLengths, 'alignVmobjectPair(target)');

  const srcSigns = startCopy.getSubpathOrientationSigns?.(srcLengths);
  const tgtSigns = targetCopy.getSubpathOrientationSigns?.(tgtLengths);

  const alignedCompound = alignCompoundPathsForTransform(
    startPointsRaw,
    srcLengths,
    targetPointsRaw,
    tgtLengths,
    srcSigns,
    tgtSigns,
  );

  if (alignedCompound) {
    return {
      startPoints: alignedCompound.srcAlignedPoints,
      targetPoints: alignedCompound.tgtAlignedPoints,
      alignedSubpathLengths: alignedCompound.alignedSubpathLengths,
      finalTargetPoints,
      finalTargetSubpathLengths,
    };
  }

  startCopy.alignPoints(targetCopy);
  const fallbackStartPoints = startCopy.getLocalPoints();
  const fallbackTargetPoints = targetCopy.getLocalPoints();

  if (fallbackStartPoints.length !== fallbackTargetPoints.length) {
    throw new Error(
      `alignVmobjectPair: alignPoints fallback produced mismatched point counts (${fallbackStartPoints.length} vs ${fallbackTargetPoints.length})`,
    );
  }

  return {
    startPoints: fallbackStartPoints,
    targetPoints: fallbackTargetPoints,
    alignedSubpathLengths: undefined,
    finalTargetPoints,
    finalTargetSubpathLengths,
  };
}

export function canMorphByPoints(source: VMobject, target: VMobject): boolean {
  return source.getLocalPoints().length > 0 && target.getLocalPoints().length > 0;
}

/**
 * True when `m` owns no geometry itself but delegates entirely to VMobject
 * descendants — VGroup always qualifies, but so does any plain VMobject
 * subclass that clears its own points and renders via children (DashedLine,
 * a multi-component RegularPolygram, ...). Such mobjects can't be morphed by
 * `alignVmobjectPair` (their own point list is empty); they need leaf-by-leaf
 * pairing instead, via {@link pairLeafSnapshotsByIndex}.
 */
export function needsLeafPairing(m: VMobject): boolean {
  return !m.hasOwnPoints() && m.familyMembersWithPoints().length > 0;
}

function makePlaceholderSnapshot(reference?: LeafVMobjectSnapshot): LeafVMobjectSnapshot {
  return {
    leaf: new VMobject(),
    worldMatrix: reference?.worldMatrix.clone() ?? new THREE.Matrix4().identity(),
    parentWorldMatrix: reference?.parentWorldMatrix.clone() ?? new THREE.Matrix4().identity(),
    worldPosition: reference?.worldPosition.clone() ?? new THREE.Vector3(),
    worldRotation: reference?.worldRotation.clone() ?? new THREE.Euler(),
    worldScale: reference?.worldScale.clone() ?? new THREE.Vector3(1, 1, 1),
  };
}

/** A real copy of an existing leaf, starting at that leaf's own world transform. */
function duplicateLeafSnapshot(reference: LeafVMobjectSnapshot): LeafVMobjectSnapshot {
  return {
    leaf: reference.leaf.copy() as VMobject,
    worldMatrix: reference.worldMatrix.clone(),
    parentWorldMatrix: reference.parentWorldMatrix.clone(),
    worldPosition: reference.worldPosition.clone(),
    worldRotation: reference.worldRotation.clone(),
    worldScale: reference.worldScale.clone(),
  };
}

/**
 * Manim CE's `Mobject.add_n_more_submobjects`: pad a family from `n` leaves
 * up to `targetLen` by duplicating its OWN existing leaves proportionally,
 * clustering each leaf's duplicates right after it (`repeat_indices = floor(i
 * * n / targetLen)`). A duplicate starts as a real, fully visible copy of its
 * sibling — not an invisible filler — so a large count mismatch reads as
 * some leaves visually "splitting" toward several targets (or several
 * "merging" into one), matching Manim CE's own Transform behavior, never as
 * extra geometry fading in from nothing.
 *
 * No-op (returns `leaves` unchanged, all marked "not new") when there's
 * nothing to duplicate from (`n === 0`) or nothing to pad (`n >= targetLen`).
 */
function padByDuplication(
  leaves: LeafVMobjectSnapshot[],
  targetLen: number,
): Array<{ snapshot: LeafVMobjectSnapshot; isNew: boolean }> {
  const n = leaves.length;
  if (n === 0 || n >= targetLen) {
    return leaves.map((snapshot) => ({ snapshot, isNew: false }));
  }
  const repeatIndexOf = (i: number) => Math.floor((i * n) / targetLen);
  const result: Array<{ snapshot: LeafVMobjectSnapshot; isNew: boolean }> = [];
  for (let i = 0; i < targetLen; i++) {
    const srcIdx = repeatIndexOf(i);
    const isFirstOccurrence = i === 0 || repeatIndexOf(i - 1) !== srcIdx;
    result.push(
      isFirstOccurrence
        ? { snapshot: leaves[srcIdx], isNew: false }
        : { snapshot: duplicateLeafSnapshot(leaves[srcIdx]), isNew: true },
    );
  }
  return result;
}

export interface LeafPairByIndex {
  source: LeafVMobjectSnapshot;
  target: LeafVMobjectSnapshot;
  /** Blank, faded filler -- only when one side has zero leaves at all. */
  sourceIsPlaceholder: boolean;
  targetIsPlaceholder: boolean;
  /**
   * True when `source.leaf` was just created (a duplicate, or a blank
   * placeholder) and isn't yet a child of the source root -- the caller must
   * `add()` it. Never true for target leaves: those are only read for
   * interpolation targets, never inserted into the source's scene graph.
   */
  sourceIsNew: boolean;
}

export function pairLeafSnapshotsByIndex(
  sourceRoot: VMobject,
  targetRoot: VMobject,
): LeafPairByIndex[] {
  const sourceLeaves = collectLeafVMobjectSnapshots(sourceRoot);
  const targetLeaves = collectLeafVMobjectSnapshots(targetRoot);

  if (sourceLeaves.length === 0 && targetLeaves.length === 0) {
    throw new Error('pairLeafSnapshotsByIndex: both source and target have zero leaves');
  }

  if (sourceLeaves.length > 0 && targetLeaves.length > 0) {
    const maxLen = Math.max(sourceLeaves.length, targetLeaves.length);
    const paddedSource = padByDuplication(sourceLeaves, maxLen);
    const paddedTarget = padByDuplication(targetLeaves, maxLen);
    const pairs: LeafPairByIndex[] = [];
    for (let i = 0; i < maxLen; i++) {
      pairs.push({
        source: paddedSource[i].snapshot,
        target: paddedTarget[i].snapshot,
        sourceIsPlaceholder: false,
        targetIsPlaceholder: false,
        sourceIsNew: paddedSource[i].isNew,
      });
    }
    return pairs;
  }

  // One side has zero leaves at all -- nothing to duplicate from. Matches
  // Manim CE's own bootstrap (add_n_more_submobjects inserts one blank
  // VMobject first when curr === 0): fall back to a blank, faded placeholder.
  const maxLen = Math.max(sourceLeaves.length, targetLeaves.length);
  const pairs: LeafPairByIndex[] = [];
  for (let i = 0; i < maxLen; i++) {
    const source = sourceLeaves[i];
    const target = targetLeaves[i];
    if (source) {
      pairs.push({
        source,
        target: makePlaceholderSnapshot(source),
        sourceIsPlaceholder: false,
        targetIsPlaceholder: true,
        sourceIsNew: false,
      });
    } else {
      pairs.push({
        source: makePlaceholderSnapshot(target),
        target: target as LeafVMobjectSnapshot,
        sourceIsPlaceholder: true,
        targetIsPlaceholder: false,
        sourceIsNew: true,
      });
    }
  }
  return pairs;
}
