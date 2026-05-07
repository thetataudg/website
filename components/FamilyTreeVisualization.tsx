"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ReactFlow, {
  Background,
  Controls,
  Edge,
  Handle,
  MarkerType,
  MiniMap,
  Node,
  NodeProps,
  Position,
  ReactFlowProvider,
  ReactFlowInstance,
} from "reactflow";
import type { FamilyTree, TreeEdge, TreeNode } from "@/lib/family-tree-utils";

type VisualizationNodeData = TreeNode & {
  href: string;
};

const NODE_WIDTH = 130;
const NODE_HEIGHT = 50;
const SIBLING_GAP = 42;
const ROOT_GAP = 120;
const LAYER_GAP = 100;

const getMemberSortKey = (node: TreeNode) =>
  `${node.fName} ${node.lName} ${node.rollNo}`.toLowerCase();

function FamilyTreeNode({ data }: NodeProps<VisualizationNodeData>) {
  const isRemoved = data.status === "Removed";

  return (
    <div
      className="w-[8.5rem] rounded-2xl border px-2 py-2 text-center shadow-[0_10px_24px_rgba(0,0,0,0.14)] transition-transform duration-200 border-[#d9b36a]/40 bg-[#fff8ea] text-[#140d0d]"
    >
      <Handle type="target" position={Position.Top} className="!bg-[#b3202a]" />
      <div>
        <div className="text-sm font-bold leading-tight text-[#7a0104]">
          {isRemoved ? "Membership Resigned" : `${data.fName} ${data.lName}`}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-[#b3202a]" />
    </div>
  );
}

const nodeTypes = { familyNode: FamilyTreeNode };

function computeLayout(tree: FamilyTree, profileBasePath: string) {
  const nodeLookup = new Map(tree.nodes.map((node) => [node.id, node]));
  const visibleNodes = tree.nodes;
  const visibleEdges = tree.edges;

  const childrenMap = new Map<string, string[]>();
  const parentsMap = new Map<string, string[]>();

  visibleEdges.forEach((edge) => {
    if (!childrenMap.has(edge.source)) childrenMap.set(edge.source, []);
    if (!parentsMap.has(edge.target)) parentsMap.set(edge.target, []);
    childrenMap.get(edge.source)!.push(edge.target);
    parentsMap.get(edge.target)!.push(edge.source);
  });

  const sortChildren = (nodeId: string) =>
    (childrenMap.get(nodeId) || [])
      .slice()
      .sort((leftId, rightId) => {
        const leftNode = nodeLookup.get(leftId);
        const rightNode = nodeLookup.get(rightId);
        if (!leftNode || !rightNode) return leftId.localeCompare(rightId);
        return getMemberSortKey(leftNode).localeCompare(getMemberSortKey(rightNode));
      });

  const rootIds = tree.rootNodes.filter((rootId) => nodeLookup.has(rootId));
  const allVisibleIds = new Set(visibleNodes.map((node) => node.id));
  const widthMap = new Map<string, number>();
  const positionMap = new Map<string, { x: number; y: number }>();

  const measureSubtree = (nodeId: string, stack = new Set<string>()): number => {
    if (widthMap.has(nodeId)) {
      return widthMap.get(nodeId)!;
    }

    if (stack.has(nodeId)) {
      widthMap.set(nodeId, NODE_WIDTH);
      return NODE_WIDTH;
    }

    stack.add(nodeId);
    const childIds = sortChildren(nodeId).filter((childId) => allVisibleIds.has(childId));

    if (childIds.length === 0) {
      widthMap.set(nodeId, NODE_WIDTH);
      stack.delete(nodeId);
      return NODE_WIDTH;
    }

    const childrenWidth = childIds.reduce((sum, childId, index) => {
      const childWidth = measureSubtree(childId, stack);
      return sum + childWidth + (index < childIds.length - 1 ? SIBLING_GAP : 0);
    }, 0);

    const totalWidth = Math.max(NODE_WIDTH, childrenWidth);
    widthMap.set(nodeId, totalWidth);
    stack.delete(nodeId);
    return totalWidth;
  };

  const placeSubtree = (nodeId: string, left: number, depth: number) => {
    const subtreeWidth = widthMap.get(nodeId) ?? NODE_WIDTH;
    const nodeX = left + (subtreeWidth - NODE_WIDTH) / 2;
    positionMap.set(nodeId, { x: nodeX, y: depth * LAYER_GAP });

    const childIds = sortChildren(nodeId).filter((childId) => allVisibleIds.has(childId));
    if (childIds.length === 0) {
      return;
    }

    const childrenWidth = childIds.reduce((sum, childId, index) => {
      const childWidth = widthMap.get(childId) ?? NODE_WIDTH;
      return sum + childWidth + (index < childIds.length - 1 ? SIBLING_GAP : 0);
    }, 0);

    let cursor = left + (subtreeWidth - childrenWidth) / 2;
    childIds.forEach((childId) => {
      const childWidth = widthMap.get(childId) ?? NODE_WIDTH;
      placeSubtree(childId, cursor, depth + 1);
      cursor += childWidth + SIBLING_GAP;
    });
  };

  const orderedRoots = rootIds.length > 0
    ? rootIds
    : visibleNodes
        .map((node) => node.id)
        .sort((leftId, rightId) => {
          const leftNode = nodeLookup.get(leftId);
          const rightNode = nodeLookup.get(rightId);
          if (!leftNode || !rightNode) return leftId.localeCompare(rightId);
          return getMemberSortKey(leftNode).localeCompare(getMemberSortKey(rightNode));
        });

  let rootCursor = 0;
  orderedRoots.forEach((rootId, index) => {
    const width = measureSubtree(rootId);
    placeSubtree(rootId, rootCursor, 0);
    rootCursor += width + (index < orderedRoots.length - 1 ? ROOT_GAP : 0);
  });

  visibleNodes.forEach((node) => {
    if (!positionMap.has(node.id)) {
      measureSubtree(node.id);
      placeSubtree(node.id, rootCursor, 0);
      rootCursor += (widthMap.get(node.id) ?? NODE_WIDTH) + ROOT_GAP;
    }
  });

  const flowNodes: Node<VisualizationNodeData>[] = visibleNodes.map((node) => {
    const position = positionMap.get(node.id) ?? { x: 0, y: 0 };
    return {
      id: node.id,
      type: "familyNode",
      position,
      data: {
        ...node,
        href: `${profileBasePath}/${node.rollNo}`,
      },
    };
  });

  const flowEdges: Edge[] = visibleEdges.map((edge: TreeEdge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: "smoothstep",
    animated: false,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: "#b3202a",
    },
    style: {
      stroke: "#b3202a",
      strokeWidth: 2,
    },
  }));

  return { nodes: flowNodes, edges: flowEdges };
}

function FamilyTreeViewport({
  apiPath,
  profileBasePath,
  embedded = false,
}: {
  apiPath: string;
  profileBasePath: string;
  embedded?: boolean;
}) {
  const router = useRouter();
  const [tree, setTree] = useState<FamilyTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance | null>(null);
  const initialViewAppliedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function loadTree() {
      try {
        setLoading(true);
        const response = await fetch(apiPath, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Failed to load tree (${response.status})`);
        }
        const data = (await response.json()) as FamilyTree;
        if (!cancelled) {
          setTree(data);
          setError(null);
        }
      } catch (loadError: any) {
        if (!cancelled) {
          setError(loadError?.message || "Failed to load tree");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadTree();

    return () => {
      cancelled = true;
    };
  }, [apiPath]);

  const flow = useMemo(() => {
    if (!tree) {
      return { nodes: [], edges: [] };
    }
    return computeLayout(tree, profileBasePath);
  }, [tree, profileBasePath]);

  useEffect(() => {
    if (!flowInstance || loading || flow.nodes.length === 0 || initialViewAppliedRef.current) {
      return;
    }

    const maxY = Math.max(...flow.nodes.map((node) => node.position.y));
    const bottomNodes = flow.nodes.filter((node) => node.position.y === maxY);

    const centerX =
      bottomNodes.reduce((sum, node) => sum + node.position.x + NODE_WIDTH / 2, 0) /
      bottomNodes.length;

    flowInstance.setCenter(centerX + 16000, maxY - NODE_HEIGHT * 18, {
      zoom: 0.7,
      duration: 0,
    });

    initialViewAppliedRef.current = true;
  }, [flow.nodes, flowInstance, loading]);

  return (
    <ReactFlowProvider>
      <div className={embedded ? "w-full text-[#1a1111]" : "mx-auto max-w-7xl px-4 pb-16 pt-28 text-[#1a1111] sm:px-6 lg:px-8"}>
        <section
          className={
            embedded
              ? "overflow-hidden rounded-[2rem] border border-[#d9b36a]/30 bg-[linear-gradient(180deg,rgba(251,246,220,0.98),rgba(255,251,242,0.96))] shadow-[0_24px_90px_rgba(20,13,13,0.18)]"
              : "overflow-hidden rounded-[2rem] border border-[#d9b36a]/30 bg-[linear-gradient(180deg,rgba(251,246,220,0.98),rgba(255,251,242,0.96))] shadow-[0_24px_90px_rgba(20,13,13,0.18)]"
          }
        >
          {!embedded && (
            <div className="border-b border-[#d9b36a]/30 px-6 py-6 sm:px-8">
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#7a0104]">
                  Theta Tau Family Tree
                </p>
                <div className="mt-3 max-w-2xl">
                  <h1 className="text-3xl font-bold tracking-tight text-[#140d0d] sm:text-4xl">
                    Bigs and littles across the chapter
                  </h1>
                  <p className="mt-3 text-sm leading-6 text-[#4d3a2a] sm:text-base">
                    Removed members are shown as X, and graduation year is intentionally hidden.
                  </p>
                </div>
              </>
            </div>
          )}

          <div className={embedded ? "h-[78vh] min-h-[42rem] w-full bg-[radial-gradient(circle_at_top,rgba(245,215,154,0.20),transparent_32%),linear-gradient(180deg,rgba(255,251,242,0.9),rgba(248,241,222,0.98))]" : "h-[78vh] min-h-[42rem] bg-[radial-gradient(circle_at_top,rgba(245,215,154,0.20),transparent_32%),linear-gradient(180deg,rgba(255,251,242,0.9),rgba(248,241,222,0.98))]"}>
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm font-semibold uppercase tracking-[0.3em] text-[#7a0104]">
                Loading family tree...
              </div>
            ) : error ? (
              <div className="flex h-full items-center justify-center px-6 text-center">
                <div className="max-w-md rounded-3xl border border-red-200 bg-white px-6 py-5 text-sm text-red-700 shadow-sm">
                  {error}
                </div>
              </div>
            ) : (
              <ReactFlow
                nodes={flow.nodes}
                edges={flow.edges}
                nodeTypes={nodeTypes}
                onInit={setFlowInstance}
                style={{ width: "100%", height: "100%" }}
                onNodeClick={(_, node) => {
                  router.push(node.data.href);
                }}
                proOptions={{ hideAttribution: true }}
                minZoom={0.15}
                maxZoom={1.25}
                defaultViewport={{ x: 0, y: 0, zoom: 0.85 }}
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable={false}
                panOnDrag
                zoomOnScroll
                zoomOnPinch
              >
                <MiniMap
                  nodeColor={(node) => (node.data.status === "Removed" ? "#7a0104" : "#b3202a")}
                  maskColor="rgba(20, 13, 13, 0.05)"
                  zoomable
                  pannable
                />
                <Controls position="bottom-right" />
                <Background gap={24} size={1} color="#e7d6ae" />
              </ReactFlow>
            )}
          </div>
        </section>
      </div>
    </ReactFlowProvider>
  );
}

export default function FamilyTreeVisualization(props: {
  apiPath: string;
  profileBasePath: string;
  embedded?: boolean;
}) {
  return <FamilyTreeViewport {...props} />;
}