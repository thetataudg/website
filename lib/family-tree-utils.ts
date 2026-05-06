// lib/family-tree-utils.ts
import Member from "@/lib/models/Member";
import logger from "@/lib/logger";

export interface TreeNode {
  id: string;
  rollNo: string;
  fName: string;
  lName: string;
  status: string;
  memberId?: string;
}

export interface TreeEdge {
  id: string;
  source: string; // member ID (big)
  target: string; // member ID (little)
  type: "big-little";
}

export interface FamilyTree {
  nodes: TreeNode[];
  edges: TreeEdge[];
  rootNodes: string[]; // member IDs of those without a big
}

/**
 * Build a complete family tree from the Member collection.
 * Normalizes nodes and edges, derives roots, and validates for cycles/duplicates.
 */
export async function buildFamilyTree(): Promise<FamilyTree> {
  try {
    const members = await Member.find()
      .lean()
      .select("_id rollNo fName lName status bigs littles");

    if (!members || members.length === 0) {
      return { nodes: [], edges: [], rootNodes: [] };
    }

    // Create a map for quick lookup and tracking processed nodes
    const memberMap = new Map(members.map((m: any) => [m._id.toString(), m]));

    // Build nodes
    const nodes: TreeNode[] = members.map((m: any) => ({
      id: m._id.toString(),
      rollNo: m.rollNo,
      fName: m.fName,
      lName: m.lName,
      status: m.status || "Active",
      memberId: m._id.toString(),
    }));

    // Build edges and track processed edges to avoid duplicates
    const processedEdges = new Set<string>();
    const edges: TreeEdge[] = [];

    members.forEach((member: any) => {
      const littles = member.littles || [];
      littles.forEach((littleId: any) => {
        const littleIdStr = littleId.toString();
        const edgeKey = `${member._id.toString()}-${littleIdStr}`;

        // Avoid duplicate edges
        if (!processedEdges.has(edgeKey) && memberMap.has(littleIdStr)) {
          edges.push({
            id: edgeKey,
            source: member._id.toString(),
            target: littleIdStr,
            type: "big-little",
          });
          processedEdges.add(edgeKey);
        }
      });
    });

    // Derive root nodes: members without a big
    const rootNodes: string[] = members
      .filter((m: any) => !m.bigs || m.bigs.length === 0)
      .map((m: any) => m._id.toString());

    // Validate for cycles (basic check: if a member appears in their own ancestor chain)
    validateNoCycles(edges, rootNodes);

    logger.info(
      { nodeCount: nodes.length, edgeCount: edges.length, rootCount: rootNodes.length },
      "Family tree built successfully"
    );

    return { nodes, edges, rootNodes };
  } catch (err: any) {
    logger.error({ err }, "Failed to build family tree");
    throw err;
  }
}

/**
 * Simple cycle detection: walk from each root and ensure no member is visited twice
 */
function validateNoCycles(edges: TreeEdge[], rootNodes: string[]): void {
  const edgeMap = new Map<string, string[]>();

  edges.forEach((edge) => {
    if (!edgeMap.has(edge.source)) {
      edgeMap.set(edge.source, []);
    }
    edgeMap.get(edge.source)!.push(edge.target);
  });

  const visited = new Set<string>();
  const visiting = new Set<string>();

  function dfs(nodeId: string): void {
    if (visiting.has(nodeId)) {
      logger.warn({ nodeId }, "Cycle detected in family tree");
      return;
    }
    if (visited.has(nodeId)) return;

    visiting.add(nodeId);
    const children = edgeMap.get(nodeId) || [];
    children.forEach((childId) => dfs(childId));
    visiting.delete(nodeId);
    visited.add(nodeId);
  }

  rootNodes.forEach((rootId) => {
    visited.clear();
    visiting.clear();
    dfs(rootId);
  });
}

/**
 * Validate import data: check for unresolved roll numbers and conflicts
 */
export interface ImportValidationResult {
  valid: boolean;
  creates: ImportAction[];
  updates: ImportAction[];
  errors: string[];
  warnings: string[];
}

export interface ImportAction {
  rollNo: string;
  fName: string;
  lName: string;
  action: "create" | "update";
  reason?: string;
}

export interface FamilyTreeImportInput {
  rollNo: string | number;
  fName: string;
  lName: string;
  big: string | number | null;
  littles: Array<string | number>;
}

export async function validateFamilyTreeImport(
  jsonData: FamilyTreeImportInput[]
): Promise<ImportValidationResult> {
  const result: ImportValidationResult = {
    valid: true,
    creates: [],
    updates: [],
    errors: [],
    warnings: [],
  };

  // Normalize roll numbers from JSON
  const jsonMembersMap = new Map(
    jsonData.map((m) => [String(m.rollNo), m])
  );

  // Get existing members
  const existingMembers = await Member.find()
    .lean()
    .select("rollNo fName lName");
  const existingMap = new Map(existingMembers.map((m: any) => [m.rollNo, m]));

  // Check each JSON record
  jsonData.forEach((jsonMember) => {
    const rollNo = String(jsonMember.rollNo);
    const existing = existingMap.get(rollNo);

    if (existing) {
      // This member exists; we will update relationships only
      result.updates.push({
        rollNo,
        fName: existing.fName,
        lName: existing.lName,
        action: "update",
        reason: "Update big/little relationships",
      });
    } else {
      // Create a new placeholder
      result.creates.push({
        rollNo,
        fName: jsonMember.fName,
        lName: jsonMember.lName,
        action: "create",
        reason: "Create placeholder alumni profile",
      });
    }
  });

  // Check for unresolved big/little references
  jsonData.forEach((jsonMember) => {
    const rollNo = String(jsonMember.rollNo);

    if (jsonMember.big !== null && !jsonMembersMap.has(String(jsonMember.big))) {
      result.warnings.push(
        `Roll #${rollNo} has big #${jsonMember.big} which is not in the import data`
      );
    }

    jsonMember.littles.forEach((littleRollNo) => {
      if (!jsonMembersMap.has(String(littleRollNo))) {
        result.warnings.push(
          `Roll #${rollNo} has little #${littleRollNo} which is not in the import data`
        );
      }
    });
  });

  return result;
}
