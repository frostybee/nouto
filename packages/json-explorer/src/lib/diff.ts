/**
 * Structural diff algorithm for JSON values.
 * Produces a flat list of diff nodes suitable for rendering side-by-side.
 */

export type DiffStatus = 'unchanged' | 'added' | 'removed' | 'changed';

export interface DiffNode {
  path: string;
  key: string | number | null;
  depth: number;
  status: DiffStatus;
  /** Value in the "left" (original) tree */
  leftValue?: any;
  /** Value in the "right" (modified) tree */
  rightValue?: any;
  leftType?: string;
  rightType?: string;
  isExpandable: boolean;
  childCount?: number;
}

export interface DiffSummary {
  added: number;
  removed: number;
  changed: number;
  unchanged: number;
}

/**
 * Compute a structural diff between two JSON values.
 * Returns a flat list of DiffNodes for rendering.
 */
export function computeStructuralDiff(left: any, right: any): { nodes: DiffNode[]; summary: DiffSummary } {
  const nodes: DiffNode[] = [];
  const summary: DiffSummary = { added: 0, removed: 0, changed: 0, unchanged: 0 };

  diffNode(left, right, '$', null, 0, nodes, summary);

  return { nodes, summary };
}

function getType(value: any): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function diffNode(
  left: any,
  right: any,
  path: string,
  key: string | number | null,
  depth: number,
  nodes: DiffNode[],
  summary: DiffSummary,
): void {
  const leftType = left !== undefined ? getType(left) : undefined;
  const rightType = right !== undefined ? getType(right) : undefined;

  // Both undefined shouldn't happen, but guard
  if (left === undefined && right === undefined) return;

  // Added (only in right)
  if (left === undefined) {
    addAllNodes(right, path, key, depth, 'added', 'right', nodes, summary);
    return;
  }

  // Removed (only in left)
  if (right === undefined) {
    addAllNodes(left, path, key, depth, 'removed', 'left', nodes, summary);
    return;
  }

  // Types differ
  if (leftType !== rightType) {
    const isExpandable = (leftType === 'object' || leftType === 'array' || rightType === 'object' || rightType === 'array');
    nodes.push({
      path, key, depth,
      status: 'changed',
      leftValue: left, rightValue: right,
      leftType, rightType,
      isExpandable,
    });
    summary.changed++;
    return;
  }

  // Both are arrays
  if (leftType === 'array') {
    const leftArr = left as any[];
    const rightArr = right as any[];
    const maxLen = Math.max(leftArr.length, rightArr.length);
    const isExpandable = true;

    nodes.push({
      path, key, depth,
      status: leftArr.length === rightArr.length ? 'unchanged' : 'changed',
      leftValue: left, rightValue: right,
      leftType, rightType,
      isExpandable,
      childCount: maxLen,
    });
    if (leftArr.length !== rightArr.length) summary.changed++;
    else summary.unchanged++;

    for (let i = 0; i < maxLen; i++) {
      const childPath = `${path}[${i}]`;
      diffNode(
        i < leftArr.length ? leftArr[i] : undefined,
        i < rightArr.length ? rightArr[i] : undefined,
        childPath, i, depth + 1, nodes, summary,
      );
    }
    return;
  }

  // Both are objects
  if (leftType === 'object') {
    const leftObj = left as Record<string, any>;
    const rightObj = right as Record<string, any>;
    const allKeys = new Set([...Object.keys(leftObj), ...Object.keys(rightObj)]);

    nodes.push({
      path, key, depth,
      status: 'unchanged',
      leftValue: left, rightValue: right,
      leftType, rightType,
      isExpandable: true,
      childCount: allKeys.size,
    });
    summary.unchanged++;

    for (const childKey of allKeys) {
      const childPath = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(childKey)
        ? `${path}.${childKey}`
        : `${path}["${childKey.replace(/"/g, '\\"')}"]`;
      diffNode(
        leftObj[childKey],
        rightObj[childKey],
        childPath, childKey, depth + 1, nodes, summary,
      );
    }
    return;
  }

  // Primitives
  if (left === right) {
    nodes.push({
      path, key, depth,
      status: 'unchanged',
      leftValue: left, rightValue: right,
      leftType, rightType,
      isExpandable: false,
    });
    summary.unchanged++;
  } else {
    nodes.push({
      path, key, depth,
      status: 'changed',
      leftValue: left, rightValue: right,
      leftType, rightType,
      isExpandable: false,
    });
    summary.changed++;
  }
}

/** Recursively add all nodes from a single side (for purely added or removed subtrees). */
function addAllNodes(
  value: any,
  path: string,
  key: string | number | null,
  depth: number,
  status: 'added' | 'removed',
  side: 'left' | 'right',
  nodes: DiffNode[],
  summary: DiffSummary,
): void {
  const type = getType(value);
  const isExpandable = type === 'object' || type === 'array';

  const node: DiffNode = {
    path, key, depth, status,
    isExpandable,
    leftType: side === 'left' ? type : undefined,
    rightType: side === 'right' ? type : undefined,
  };
  if (side === 'left') node.leftValue = value;
  else node.rightValue = value;

  nodes.push(node);
  if (status === 'added') summary.added++;
  else summary.removed++;

  if (type === 'array') {
    const arr = value as any[];
    for (let i = 0; i < arr.length; i++) {
      addAllNodes(arr[i], `${path}[${i}]`, i, depth + 1, status, side, nodes, summary);
    }
  } else if (type === 'object') {
    for (const [childKey, childValue] of Object.entries(value)) {
      const childPath = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(childKey)
        ? `${path}.${childKey}`
        : `${path}["${childKey.replace(/"/g, '\\"')}"]`;
      addAllNodes(childValue, childPath, childKey, depth + 1, status, side, nodes, summary);
    }
  }
}
