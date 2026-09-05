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

export interface LeafPairByIndex {
  source: LeafVMobjectSnapshot;
  target: LeafVMobjectSnapshot;
  sourceIsPlaceholder: boolean;
  targetIsPlaceholder: boolean;
}

export function pairLeafSnapshotsByIndex(
  sourceRoot: VMobject,
  targetRoot: VMobject,
): LeafPairByIndex[] {
  const sourceLeaves = collectLeafVMobjectSnapshots(sourceRoot);
  const targetLeaves = collectLeafVMobjectSnapshots(targetRoot);
  const maxLen = Math.max(sourceLeaves.length, targetLeaves.length);
  const pairs: LeafPairByIndex[] = [];

  for (let i = 0; i < maxLen; i++) {
    const source = sourceLeaves[i];
    const target = targetLeaves[i];
    if (!source && !target) {
      throw new Error(`pairLeafSnapshotsByIndex: invalid empty pair at index ${i}`);
    }

    if (source && target) {
      pairs.push({ source, target, sourceIsPlaceholder: false, targetIsPlaceholder: false });
      continue;
    }

    if (source && !target) {
      pairs.push({
        source,
        target: makePlaceholderSnapshot(source),
        sourceIsPlaceholder: false,
        targetIsPlaceholder: true,
      });
      continue;
    }

    pairs.push({
      source: makePlaceholderSnapshot(target),
      target: target as LeafVMobjectSnapshot,
      sourceIsPlaceholder: true,
      targetIsPlaceholder: false,
    });
  }

  return pairs;
}
