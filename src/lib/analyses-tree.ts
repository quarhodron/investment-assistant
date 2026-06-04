import type { Analysis } from "@/types";

export type AnalysisRow = Pick<Analysis, "id" | "title" | "model" | "provider" | "created_at" | "parent_analysis_id">;

export type AnalysisTreeNode = AnalysisRow & {
  children: AnalysisTreeNode[];
  subtreeSize: number;
  subtreeLatestCreatedAt: string;
};

/**
 * Transforms a flat list of analyses into a sorted forest of tree nodes.
 *
 * Algorithm:
 * 1. Index all rows by id.
 * 2. Attach each row to its parent (or promote to root if parent is absent/unknown).
 * 3. Bottom-up DFS to compute subtreeSize and subtreeLatestCreatedAt per node.
 * 4. Sort roots desc by subtreeLatestCreatedAt; sort children asc by created_at at every level.
 *
 * Invariant: sum(node.subtreeSize for root in roots) === rows.length
 * Pure: no I/O, no Date construction — ISO strings compare correctly with < / >.
 */
export function buildAnalysisForest(rows: AnalysisRow[]): AnalysisTreeNode[] {
  // Step 1: index by id
  const nodeMap = new Map<string, AnalysisTreeNode>();
  for (const row of rows) {
    nodeMap.set(row.id, {
      ...row,
      children: [],
      subtreeSize: 1,
      subtreeLatestCreatedAt: row.created_at,
    });
  }

  // Step 2: attach children to parents; promote orphans to roots
  const roots: AnalysisTreeNode[] = [];
  for (const node of nodeMap.values()) {
    const parentId = node.parent_analysis_id;
    if (parentId !== null && nodeMap.has(parentId)) {
      const parent = nodeMap.get(parentId);
      if (parent) parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Step 3: bottom-up DFS to compute subtreeSize and subtreeLatestCreatedAt
  function computeSubtreeStats(node: AnalysisTreeNode): void {
    // Sort children asc by created_at before recursing
    node.children.sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));

    let size = 1;
    let latest = node.created_at;

    for (const child of node.children) {
      computeSubtreeStats(child);
      size += child.subtreeSize;
      if (child.subtreeLatestCreatedAt > latest) {
        latest = child.subtreeLatestCreatedAt;
      }
    }

    node.subtreeSize = size;
    node.subtreeLatestCreatedAt = latest;
  }

  for (const root of roots) {
    computeSubtreeStats(root);
  }

  // Step 4: sort roots desc by subtreeLatestCreatedAt
  roots.sort((a, b) =>
    a.subtreeLatestCreatedAt > b.subtreeLatestCreatedAt
      ? -1
      : a.subtreeLatestCreatedAt < b.subtreeLatestCreatedAt
        ? 1
        : 0,
  );

  return roots;
}
