"use client";

import styles from "./TopologyGraphComponent.module.css";

/* ═══════════════════════════════════════════════════════════════════
   TopologyGraphComponent — Static SVG mini-graph for topology tooltips

   Renders a small, animated node-and-edge diagram illustrating how
   sub-agents coordinate under each multi-agent topology. Designed to
   fit inside the rich tooltip (max-width: 320px) used by the
   SelectComponent in Settings → Agent Defaults → Subagent Topology.

   Node colors are semantic roles resolved to theme tokens in the
   module CSS, so diagrams adapt to the active theme.
   ═══════════════════════════════════════════════════════════════════ */

/** Semantic node roles — each maps to a theme token in the module CSS. */
type TopologyNodeRole =
  | "orchestrator"
  | "agent"
  | "action"
  | "merge"
  | "result"
  | "validation";

interface TopologyNode {
  id: string;
  label: string;
  positionX: number;
  positionY: number;
  radius: number;
  role: TopologyNodeRole;
}

interface TopologyEdge {
  sourceId: string;
  targetId: string;
  isBidirectional?: boolean;
}

interface TopologyDefinition {
  viewBoxWidth: number;
  viewBoxHeight: number;
  nodes: TopologyNode[];
  edges: TopologyEdge[];
}

/** Node radius scale — larger radius = higher visual prominence. */
const NODE_RADIUS = {
  hub: 16,
  featured: 15,
  standard: 14,
  compact: 13,
  small: 12,
  nested: 11,
} as const;

const VIEW_BOX_WIDTH = 280;
const CENTER_X = VIEW_BOX_WIDTH / 2;

const ARROWHEAD_WIDTH = 6;
const ARROWHEAD_HEIGHT = 5;

function buildSequentialTopology(): TopologyDefinition {
  return {
    viewBoxWidth: VIEW_BOX_WIDTH,
    viewBoxHeight: 180,
    nodes: [
      { id: "orchestrator", label: "Orch", positionX: CENTER_X, positionY: 20, radius: NODE_RADIUS.hub, role: "orchestrator" },
      { id: "agent-a", label: "A", positionX: CENTER_X, positionY: 52, radius: NODE_RADIUS.standard, role: "agent" },
      { id: "agent-b", label: "B", positionX: CENTER_X, positionY: 84, radius: NODE_RADIUS.standard, role: "agent" },
      { id: "agent-c", label: "C", positionX: CENTER_X, positionY: 116, radius: NODE_RADIUS.standard, role: "agent" },
      { id: "results", label: "Result", positionX: CENTER_X, positionY: 152, radius: NODE_RADIUS.standard, role: "result" },
    ],
    edges: [
      { sourceId: "orchestrator", targetId: "agent-a" },
      { sourceId: "agent-a", targetId: "agent-b" },
      { sourceId: "agent-b", targetId: "agent-c" },
      { sourceId: "agent-c", targetId: "results" },
    ],
  };
}

function buildHierarchicalTopology(): TopologyDefinition {
  return {
    viewBoxWidth: VIEW_BOX_WIDTH,
    viewBoxHeight: 162,
    nodes: [
      { id: "orchestrator", label: "Orch", positionX: CENTER_X, positionY: 20, radius: NODE_RADIUS.hub, role: "orchestrator" },
      { id: "agent-a", label: "A", positionX: 60, positionY: 70, radius: NODE_RADIUS.standard, role: "agent" },
      { id: "agent-b", label: "B", positionX: CENTER_X, positionY: 70, radius: NODE_RADIUS.standard, role: "agent" },
      { id: "agent-c", label: "C", positionX: 220, positionY: 70, radius: NODE_RADIUS.standard, role: "agent" },
      { id: "results", label: "Winner", positionX: CENTER_X, positionY: 130, radius: NODE_RADIUS.standard, role: "result" },
    ],
    edges: [
      { sourceId: "orchestrator", targetId: "agent-a" },
      { sourceId: "orchestrator", targetId: "agent-b" },
      { sourceId: "orchestrator", targetId: "agent-c" },
      { sourceId: "agent-a", targetId: "results" },
      { sourceId: "agent-b", targetId: "results" },
      { sourceId: "agent-c", targetId: "results" },
    ],
  };
}

function buildAggregationTopology(): TopologyDefinition {
  return {
    viewBoxWidth: VIEW_BOX_WIDTH,
    viewBoxHeight: 184,
    nodes: [
      { id: "orchestrator", label: "Orch", positionX: CENTER_X, positionY: 20, radius: NODE_RADIUS.hub, role: "orchestrator" },
      { id: "agent-a", label: "A", positionX: 60, positionY: 70, radius: NODE_RADIUS.standard, role: "agent" },
      { id: "agent-b", label: "B", positionX: CENTER_X, positionY: 70, radius: NODE_RADIUS.standard, role: "agent" },
      { id: "agent-c", label: "C", positionX: 220, positionY: 70, radius: NODE_RADIUS.standard, role: "agent" },
      { id: "merge", label: "Merge", positionX: CENTER_X, positionY: 122, radius: NODE_RADIUS.featured, role: "merge" },
      { id: "results", label: "Result", positionX: CENTER_X, positionY: 158, radius: NODE_RADIUS.standard, role: "result" },
    ],
    edges: [
      { sourceId: "orchestrator", targetId: "agent-a" },
      { sourceId: "orchestrator", targetId: "agent-b" },
      { sourceId: "orchestrator", targetId: "agent-c" },
      { sourceId: "agent-a", targetId: "merge" },
      { sourceId: "agent-b", targetId: "merge" },
      { sourceId: "agent-c", targetId: "merge" },
      { sourceId: "merge", targetId: "results" },
    ],
  };
}

function buildPeerToPeerTopology(): TopologyDefinition {
  const centerY = 88;
  const meshRadius = 50;

  const agentAPositionX = CENTER_X + Math.cos(-Math.PI / 6) * meshRadius;
  const agentAPositionY = centerY + Math.sin(-Math.PI / 6) * meshRadius;
  const agentBPositionX = CENTER_X + Math.cos((7 * Math.PI) / 6) * meshRadius;
  const agentBPositionY = centerY + Math.sin((7 * Math.PI) / 6) * meshRadius;
  const agentCPositionX = CENTER_X + Math.cos(Math.PI / 2) * meshRadius;
  const agentCPositionY = centerY + Math.sin(Math.PI / 2) * meshRadius;

  return {
    viewBoxWidth: VIEW_BOX_WIDTH,
    viewBoxHeight: 190,
    nodes: [
      { id: "orchestrator", label: "Orch", positionX: CENTER_X, positionY: 18, radius: NODE_RADIUS.hub, role: "orchestrator" },
      { id: "agent-a", label: "A", positionX: agentAPositionX, positionY: agentAPositionY, radius: NODE_RADIUS.standard, role: "agent" },
      { id: "agent-b", label: "B", positionX: agentBPositionX, positionY: agentBPositionY, radius: NODE_RADIUS.standard, role: "agent" },
      { id: "agent-c", label: "C", positionX: agentCPositionX, positionY: agentCPositionY, radius: NODE_RADIUS.standard, role: "agent" },
      { id: "results", label: "Result", positionX: CENTER_X, positionY: 162, radius: NODE_RADIUS.standard, role: "result" },
    ],
    edges: [
      { sourceId: "orchestrator", targetId: "agent-a" },
      { sourceId: "orchestrator", targetId: "agent-b" },
      { sourceId: "orchestrator", targetId: "agent-c" },
      { sourceId: "agent-a", targetId: "agent-b", isBidirectional: true },
      { sourceId: "agent-b", targetId: "agent-c", isBidirectional: true },
      { sourceId: "agent-a", targetId: "agent-c", isBidirectional: true },
      { sourceId: "agent-a", targetId: "results" },
      { sourceId: "agent-b", targetId: "results" },
      { sourceId: "agent-c", targetId: "results" },
    ],
  };
}

function buildChainOfThoughtTopology(): TopologyDefinition {
  return {
    viewBoxWidth: VIEW_BOX_WIDTH,
    viewBoxHeight: 204,
    nodes: [
      { id: "prompt", label: "Prompt", positionX: CENTER_X, positionY: 20, radius: NODE_RADIUS.hub, role: "orchestrator" },
      { id: "reason-1", label: "Reason", positionX: CENTER_X, positionY: 54, radius: NODE_RADIUS.standard, role: "agent" },
      { id: "act", label: "Act", positionX: CENTER_X, positionY: 88, radius: NODE_RADIUS.standard, role: "action" },
      { id: "observe", label: "Observe", positionX: CENTER_X, positionY: 122, radius: NODE_RADIUS.standard, role: "merge" },
      { id: "reason-2", label: "Reason", positionX: CENTER_X, positionY: 152, radius: NODE_RADIUS.small, role: "agent" },
      { id: "answer", label: "Answer", positionX: CENTER_X, positionY: 182, radius: NODE_RADIUS.standard, role: "result" },
    ],
    edges: [
      { sourceId: "prompt", targetId: "reason-1" },
      { sourceId: "reason-1", targetId: "act" },
      { sourceId: "act", targetId: "observe" },
      { sourceId: "observe", targetId: "reason-2" },
      { sourceId: "reason-2", targetId: "answer" },
    ],
  };
}

function buildTreeOfThoughtsTopology(): TopologyDefinition {
  return {
    viewBoxWidth: VIEW_BOX_WIDTH,
    viewBoxHeight: 224,
    nodes: [
      { id: "prompt", label: "Prompt", positionX: CENTER_X, positionY: 20, radius: NODE_RADIUS.hub, role: "orchestrator" },
      { id: "branch-a", label: "A", positionX: 60, positionY: 60, radius: NODE_RADIUS.compact, role: "agent" },
      { id: "branch-b", label: "B", positionX: CENTER_X, positionY: 60, radius: NODE_RADIUS.compact, role: "agent" },
      { id: "branch-c", label: "C", positionX: 220, positionY: 60, radius: NODE_RADIUS.compact, role: "agent" },
      { id: "score", label: "Score", positionX: CENTER_X, positionY: 98, radius: NODE_RADIUS.standard, role: "merge" },
      { id: "best", label: "Best", positionX: CENTER_X, positionY: 130, radius: NODE_RADIUS.compact, role: "result" },
      { id: "act", label: "Act", positionX: CENTER_X, positionY: 160, radius: NODE_RADIUS.compact, role: "action" },
      { id: "validate", label: "Valid?", positionX: CENTER_X, positionY: 192, radius: NODE_RADIUS.standard, role: "validation" },
    ],
    edges: [
      { sourceId: "prompt", targetId: "branch-a" },
      { sourceId: "prompt", targetId: "branch-b" },
      { sourceId: "prompt", targetId: "branch-c" },
      { sourceId: "branch-a", targetId: "score" },
      { sourceId: "branch-b", targetId: "score" },
      { sourceId: "branch-c", targetId: "score" },
      { sourceId: "score", targetId: "best" },
      { sourceId: "best", targetId: "act" },
      { sourceId: "act", targetId: "validate" },
    ],
  };
}

function buildGraphOfThoughtsTopology(): TopologyDefinition {
  return {
    viewBoxWidth: VIEW_BOX_WIDTH,
    viewBoxHeight: 224,
    nodes: [
      { id: "prompt", label: "Prompt", positionX: CENTER_X, positionY: 20, radius: NODE_RADIUS.hub, role: "orchestrator" },
      { id: "branch-a", label: "A", positionX: 60, positionY: 60, radius: NODE_RADIUS.compact, role: "agent" },
      { id: "branch-b", label: "B", positionX: CENTER_X, positionY: 60, radius: NODE_RADIUS.compact, role: "agent" },
      { id: "branch-c", label: "C", positionX: 220, positionY: 60, radius: NODE_RADIUS.compact, role: "agent" },
      { id: "score", label: "Score", positionX: CENTER_X, positionY: 98, radius: NODE_RADIUS.standard, role: "merge" },
      { id: "merge", label: "Merge", positionX: CENTER_X, positionY: 130, radius: NODE_RADIUS.standard, role: "merge" },
      { id: "synth", label: "Synth", positionX: CENTER_X, positionY: 162, radius: NODE_RADIUS.compact, role: "result" },
      { id: "act", label: "Act", positionX: CENTER_X, positionY: 194, radius: NODE_RADIUS.compact, role: "action" },
    ],
    edges: [
      { sourceId: "prompt", targetId: "branch-a" },
      { sourceId: "prompt", targetId: "branch-b" },
      { sourceId: "prompt", targetId: "branch-c" },
      { sourceId: "branch-a", targetId: "score" },
      { sourceId: "branch-b", targetId: "score" },
      { sourceId: "branch-c", targetId: "score" },
      { sourceId: "score", targetId: "merge" },
      { sourceId: "merge", targetId: "synth" },
      { sourceId: "synth", targetId: "act" },
    ],
  };
}

function buildTournamentTopology(): TopologyDefinition {
  return {
    viewBoxWidth: VIEW_BOX_WIDTH,
    viewBoxHeight: 194,
    nodes: [
      { id: "orchestrator", label: "Orch", positionX: CENTER_X, positionY: 20, radius: NODE_RADIUS.hub, role: "orchestrator" },
      { id: "agent-a", label: "A", positionX: 60, positionY: 70, radius: NODE_RADIUS.standard, role: "agent" },
      { id: "agent-b", label: "B", positionX: CENTER_X, positionY: 70, radius: NODE_RADIUS.standard, role: "agent" },
      { id: "agent-c", label: "C", positionX: 220, positionY: 70, radius: NODE_RADIUS.standard, role: "agent" },
      { id: "judge", label: "Judge", positionX: CENTER_X, positionY: 126, radius: NODE_RADIUS.featured, role: "merge" },
      { id: "winner", label: "Winner", positionX: CENTER_X, positionY: 168, radius: NODE_RADIUS.standard, role: "result" },
    ],
    edges: [
      { sourceId: "orchestrator", targetId: "agent-a" },
      { sourceId: "orchestrator", targetId: "agent-b" },
      { sourceId: "orchestrator", targetId: "agent-c" },
      { sourceId: "agent-a", targetId: "judge" },
      { sourceId: "agent-b", targetId: "judge" },
      { sourceId: "agent-c", targetId: "judge" },
      { sourceId: "judge", targetId: "winner" },
    ],
  };
}

function buildCriticLoopTopology(): TopologyDefinition {
  return {
    viewBoxWidth: VIEW_BOX_WIDTH,
    viewBoxHeight: 194,
    nodes: [
      { id: "orchestrator", label: "Orch", positionX: CENTER_X, positionY: 20, radius: NODE_RADIUS.hub, role: "orchestrator" },
      { id: "actor", label: "Actor", positionX: CENTER_X, positionY: 68, radius: NODE_RADIUS.featured, role: "agent" },
      { id: "critic", label: "Critic", positionX: CENTER_X, positionY: 118, radius: NODE_RADIUS.featured, role: "merge" },
      { id: "result", label: "Pass", positionX: CENTER_X, positionY: 168, radius: NODE_RADIUS.standard, role: "result" },
    ],
    edges: [
      { sourceId: "orchestrator", targetId: "actor" },
      { sourceId: "actor", targetId: "critic" },
      { sourceId: "critic", targetId: "result" },
    ],
  };
}

function buildDivideAndConquerTopology(): TopologyDefinition {
  return {
    viewBoxWidth: VIEW_BOX_WIDTH,
    viewBoxHeight: 214,
    nodes: [
      { id: "orchestrator", label: "Orch", positionX: CENTER_X, positionY: 20, radius: NODE_RADIUS.hub, role: "orchestrator" },
      { id: "planner", label: "Plan", positionX: CENTER_X, positionY: 60, radius: NODE_RADIUS.standard, role: "action" },
      { id: "task-a", label: "T₁", positionX: 60, positionY: 108, radius: NODE_RADIUS.compact, role: "agent" },
      { id: "task-b", label: "T₂", positionX: CENTER_X, positionY: 108, radius: NODE_RADIUS.compact, role: "agent" },
      { id: "task-c", label: "T₃", positionX: 220, positionY: 108, radius: NODE_RADIUS.compact, role: "agent" },
      { id: "synth", label: "Synth", positionX: CENTER_X, positionY: 154, radius: NODE_RADIUS.featured, role: "merge" },
      { id: "result", label: "Result", positionX: CENTER_X, positionY: 192, radius: NODE_RADIUS.standard, role: "result" },
    ],
    edges: [
      { sourceId: "orchestrator", targetId: "planner" },
      { sourceId: "planner", targetId: "task-a" },
      { sourceId: "planner", targetId: "task-b" },
      { sourceId: "planner", targetId: "task-c" },
      { sourceId: "task-a", targetId: "synth" },
      { sourceId: "task-b", targetId: "synth" },
      { sourceId: "task-c", targetId: "synth" },
      { sourceId: "synth", targetId: "result" },
    ],
  };
}

function buildMCTSTopology(): TopologyDefinition {
  return {
    viewBoxWidth: VIEW_BOX_WIDTH,
    viewBoxHeight: 234,
    nodes: [
      { id: "orchestrator", label: "Orch", positionX: CENTER_X, positionY: 20, radius: NODE_RADIUS.hub, role: "orchestrator" },
      { id: "branch-a1", label: "B₁", positionX: 60, positionY: 62, radius: NODE_RADIUS.small, role: "agent" },
      { id: "branch-b1", label: "B₂", positionX: CENTER_X, positionY: 62, radius: NODE_RADIUS.small, role: "agent" },
      { id: "branch-c1", label: "B₃", positionX: 220, positionY: 62, radius: NODE_RADIUS.small, role: "agent" },
      { id: "eval-1", label: "Eval", positionX: CENTER_X, positionY: 102, radius: NODE_RADIUS.compact, role: "merge" },
      { id: "best-1", label: "Best", positionX: CENTER_X, positionY: 138, radius: NODE_RADIUS.small, role: "result" },
      { id: "branch-a2", label: "B₁'", positionX: 80, positionY: 172, radius: NODE_RADIUS.nested, role: "agent" },
      { id: "branch-b2", label: "B₂'", positionX: 200, positionY: 172, radius: NODE_RADIUS.nested, role: "agent" },
      { id: "eval-2", label: "Eval", positionX: CENTER_X, positionY: 204, radius: NODE_RADIUS.compact, role: "merge" },
    ],
    edges: [
      { sourceId: "orchestrator", targetId: "branch-a1" },
      { sourceId: "orchestrator", targetId: "branch-b1" },
      { sourceId: "orchestrator", targetId: "branch-c1" },
      { sourceId: "branch-a1", targetId: "eval-1" },
      { sourceId: "branch-b1", targetId: "eval-1" },
      { sourceId: "branch-c1", targetId: "eval-1" },
      { sourceId: "eval-1", targetId: "best-1" },
      { sourceId: "best-1", targetId: "branch-a2" },
      { sourceId: "best-1", targetId: "branch-b2" },
      { sourceId: "branch-a2", targetId: "eval-2" },
      { sourceId: "branch-b2", targetId: "eval-2" },
    ],
  };
}

const TOPOLOGY_BUILDERS: Record<string, () => TopologyDefinition> = {
  sequential: buildSequentialTopology,
  hierarchical: buildHierarchicalTopology,
  hierarchical_aggregation: buildAggregationTopology,
  peer_to_peer: buildPeerToPeerTopology,
  tournament: buildTournamentTopology,
  critic_loop: buildCriticLoopTopology,
  divide_and_conquer: buildDivideAndConquerTopology,
  mcts: buildMCTSTopology,
  chain_of_thought: buildChainOfThoughtTopology,
  tree_of_thoughts: buildTreeOfThoughtsTopology,
  graph_of_thoughts: buildGraphOfThoughtsTopology,
};

function computeEdgePath(
  sourceNode: TopologyNode,
  targetNode: TopologyNode,
): string {
  const deltaX = targetNode.positionX - sourceNode.positionX;
  const deltaY = targetNode.positionY - sourceNode.positionY;
  const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY) || 1;

  const unitX = deltaX / distance;
  const unitY = deltaY / distance;

  const startX = sourceNode.positionX + unitX * sourceNode.radius;
  const startY = sourceNode.positionY + unitY * sourceNode.radius;
  const endX = targetNode.positionX - unitX * targetNode.radius;
  const endY = targetNode.positionY - unitY * targetNode.radius;

  return `M ${startX} ${startY} L ${endX} ${endY}`;
}

export interface TopologyGraphComponentProps {
  topologyId: string;
}

export default function TopologyGraphComponent({ topologyId }: TopologyGraphComponentProps) {
  const builder = TOPOLOGY_BUILDERS[topologyId];
  if (!builder) return null;

  const topology = builder();
  const nodeMap = new Map(topology.nodes.map((node) => [node.id, node]));

  return (
    <div className={styles["topology-graph-container"]}>
      <svg
        className={styles["topology-graph-canvas"]}
        viewBox={`0 0 ${topology.viewBoxWidth} ${topology.viewBoxHeight}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <marker
            id={`topology-arrowhead-${topologyId}`}
            markerWidth={ARROWHEAD_WIDTH}
            markerHeight={ARROWHEAD_HEIGHT}
            refX={ARROWHEAD_WIDTH - 1}
            refY={ARROWHEAD_HEIGHT / 2}
            orient="auto"
          >
            <polygon
              points={`0 0, ${ARROWHEAD_WIDTH} ${ARROWHEAD_HEIGHT / 2}, 0 ${ARROWHEAD_HEIGHT}`}
              className={styles["topology-arrowhead"]}
            />
          </marker>
        </defs>

        {topology.edges.map((edge) => {
          const sourceNode = nodeMap.get(edge.sourceId);
          const targetNode = nodeMap.get(edge.targetId);
          if (!sourceNode || !targetNode) return null;

          const edgePath = computeEdgePath(sourceNode, targetNode);
          const edgeKey = `${edge.sourceId}-${edge.targetId}`;

          return (
            <g key={edgeKey}>
              <path
                d={edgePath}
                fill="none"
                className={styles["topology-edge-line"]}
                markerEnd={`url(#topology-arrowhead-${topologyId})`}
              />
              {edge.isBidirectional && (
                <path
                  d={edgePath}
                  fill="none"
                  className={styles["topology-edge-flow-line"]}
                />
              )}
            </g>
          );
        })}

        {topology.nodes.map((node) => (
          <g
            key={node.id}
            className={styles["topology-node-group"]}
          >
            <circle
              cx={node.positionX}
              cy={node.positionY}
              r={node.radius}
              className={`${styles["topology-node-fill"]} ${styles[`topology-node--${node.role}`]}`}
            />
            <circle
              cx={node.positionX}
              cy={node.positionY}
              r={node.radius}
              fill="none"
              className={styles["topology-node-ring"]}
            />
            <text
              x={node.positionX}
              y={node.positionY}
              className={styles["topology-node-label"]}
            >
              {node.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
