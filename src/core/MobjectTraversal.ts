import * as THREE from 'three';
import { VMobject } from './VMobject';

/**
 * Leaf VMobject plus effective (world) transform data.
 */
export interface LeafVMobjectSnapshot {
  leaf: VMobject;
  worldMatrix: THREE.Matrix4;
  parentWorldMatrix: THREE.Matrix4;
  worldPosition: THREE.Vector3;
  worldRotation: THREE.Euler;
  worldScale: THREE.Vector3;
}

interface TraversalFrame {
  node: VMobject;
  parentWorldMatrix: THREE.Matrix4;
}

function composeLocalMatrix(node: VMobject): THREE.Matrix4 {
  const localMatrix = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(node.rotation);
  localMatrix.compose(node.position, q, node.scaleVector);
  return localMatrix;
}

/**
 * Collect leaf VMobjects and their effective (world) transforms.
 *
 * This is useful when animation logic needs to reason about nested transforms
 * in Group/VGroup trees while still applying updates on leaf VMobjects.
 *
 * A node is treated as a container to descend into (rather than a leaf)
 * whenever it owns no geometry itself (`!node.hasOwnPoints()`) — not only
 * for VGroup, but for any VMobject subclass that clears its own points and
 * delegates entirely to VMobject children (DashedLine, a multi-component
 * RegularPolygram, ...). A node that owns points itself is always a leaf,
 * even if it also happens to have children.
 */
export function collectLeafVMobjectSnapshots(root: VMobject): LeafVMobjectSnapshot[] {
  const snapshots: LeafVMobjectSnapshot[] = [];
  const stack: TraversalFrame[] = [
    {
      node: root,
      parentWorldMatrix: new THREE.Matrix4().identity(),
    },
  ];

  while (stack.length > 0) {
    const { node, parentWorldMatrix } = stack.pop() as TraversalFrame;

    const localMatrix = composeLocalMatrix(node);
    const worldMatrix = new THREE.Matrix4().multiplyMatrices(parentWorldMatrix, localMatrix);

    if (!node.hasOwnPoints()) {
      // Reverse push to preserve left-to-right traversal order
      for (let i = node.children.length - 1; i >= 0; i--) {
        const child = node.children[i];
        if (child instanceof VMobject) {
          stack.push({ node: child, parentWorldMatrix: worldMatrix });
        }
      }
      continue;
    }

    const worldPosition = new THREE.Vector3();
    const worldQuaternion = new THREE.Quaternion();
    const worldScale = new THREE.Vector3();
    worldMatrix.decompose(worldPosition, worldQuaternion, worldScale);

    snapshots.push({
      leaf: node,
      worldMatrix,
      parentWorldMatrix,
      worldPosition,
      worldRotation: new THREE.Euler().setFromQuaternion(worldQuaternion, 'XYZ'),
      worldScale,
    });
  }

  return snapshots;
}

/**
 * Project a world-space position into a node's parent-local coordinates.
 * @pre  parentWorldMatrix === parent.matrixWorld (up-to-date)
 * @post result === parentWorldMatrix⁻¹ * worldPosition
 *       i.e. the same value you'd find in node.position after a normalizeTransform()
 */
export function worldToParentLocalPosition(
  worldPosition: THREE.Vector3,
  parentWorldMatrix: THREE.Matrix4,
): THREE.Vector3 {
  return worldPosition.clone().applyMatrix4(parentWorldMatrix.clone().invert());
}
