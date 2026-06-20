"use client";

import styles from "./TopologyGraphComponent.module.css";

/* ═══════════════════════════════════════════════════════════════════
   TopologyGraphComponent — Static SVG mini-graph for topology tooltips

   Renders a small, animated node-and-edge diagram illustrating how
   sub-agents coordinate under each multi-agent topology. Designed to
   fit inside the rich tooltip (max-width: 320px) used by the
   SelectComponent in Settings → Agent Defaults → Subagent Topology.
   ═══════════════════════════════════════════════════════════════════ */

interface TopologyNode {
  id: string;
  label: string;
  positionX: number;
  positionY: number;
  radius: number;
  fillColor: string;
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

const ORCHESTRATOR_COLOR = "oklch(0.60 0.18 280)";
const AGENT_COLOR = "oklch(0.60 0.16 160)";
const RESULT_COLOR = "oklch(0.55 0.14 45)";
const MERGE_COLOR = "oklch(0.58 0.16 330)";

function buildSequentialTopology(): TopologyDefinition {
  return {
    viewBoxWidth: 280,
    viewBoxHeight: 180,
    nodes: [
      { id: "orchestrator", label: "Orch", positionX: 140, positionY: 20, radius: 16, fillColor: ORCHESTRATOR_COLOR },
      { id: "agent-a", label: "A", positionX: 140, positionY: 52, radius: 14, fillColor: AGENT_COLOR },
      { id: "agent-b", label: "B", positionX: 140, positionY: 84, radius: 14, fillColor: AGENT_COLOR },
      { id: "agent-c", label: "C", positionX: 140, positionY: 116, radius: 14, fillColor: AGENT_COLOR },
      { id: "results", label: "Result", positionX: 140, positionY: 152, radius: 14, fillColor: RESULT_COLOR },
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
    viewBoxWidth: 280,
    viewBoxHeight: 162,
    nodes: [
      { id: "orchestrator", label: "Orch", positionX: 140, positionY: 20, radius: 16, fillColor: ORCHESTRATOR_COLOR },
      { id: "agent-a", label: "A", positionX: 60, positionY: 70, radius: 14, fillColor: AGENT_COLOR },
      { id: "agent-b", label: "B", positionX: 140, positionY: 70, radius: 14, fillColor: AGENT_COLOR },
      { id: "agent-c", label: "C", positionX: 220, positionY: 70, radius: 14, fillColor: AGENT_COLOR },
      { id: "results", label: "Winner", positionX: 140, positionY: 130, radius: 14, fillColor: RESULT_COLOR },
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
    viewBoxWidth: 280,
    viewBoxHeight: 184,
    nodes: [
      { id: "orchestrator", label: "Orch", positionX: 140, positionY: 20, radius: 16, fillColor: ORCHESTRATOR_COLOR },
      { id: "agent-a", label: "A", positionX: 60, positionY: 70, radius: 14, fillColor: AGENT_COLOR },
      { id: "agent-b", label: "B", positionX: 140, positionY: 70, radius: 14, fillColor: AGENT_COLOR },
      { id: "agent-c", label: "C", positionX: 220, positionY: 70, radius: 14, fillColor: AGENT_COLOR },
      { id: "merge", label: "Merge", positionX: 140, positionY: 122, radius: 15, fillColor: MERGE_COLOR },
      { id: "results", label: "Result", positionX: 140, positionY: 158, radius: 14, fillColor: RESULT_COLOR },
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
  const centerX = 140;
  const centerY = 88;
  const meshRadius = 50;

  const agentAPositionX = centerX + Math.cos(-Math.PI / 6) * meshRadius;
  const agentAPositionY = centerY + Math.sin(-Math.PI / 6) * meshRadius;
  const agentBPositionX = centerX + Math.cos((7 * Math.PI) / 6) * meshRadius;
  const agentBPositionY = centerY + Math.sin((7 * Math.PI) / 6) * meshRadius;
  const agentCPositionX = centerX + Math.cos(Math.PI / 2) * meshRadius;
  const agentCPositionY = centerY + Math.sin(Math.PI / 2) * meshRadius;

  return {
    viewBoxWidth: 280,
    viewBoxHeight: 190,
    nodes: [
      { id: "orchestrator", label: "Orch", positionX: centerX, positionY: 18, radius: 16, fillColor: ORCHESTRATOR_COLOR },
      { id: "agent-a", label: "A", positionX: agentAPositionX, positionY: agentAPositionY, radius: 14, fillColor: AGENT_COLOR },
      { id: "agent-b", label: "B", positionX: agentBPositionX, positionY: agentBPositionY, radius: 14, fillColor: AGENT_COLOR },
      { id: "agent-c", label: "C", positionX: agentCPositionX, positionY: agentCPositionY, radius: 14, fillColor: AGENT_COLOR },
      { id: "results", label: "Result", positionX: centerX, positionY: 162, radius: 14, fillColor: RESULT_COLOR },
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
    viewBoxWidth: 280,
    viewBoxHeight: 204,
    nodes: [
      { id: "prompt", label: "Prompt", positionX: 140, positionY: 20, radius: 16, fillColor: ORCHESTRATOR_COLOR },
      { id: "reason-1", label: "Reason", positionX: 140, positionY: 54, radius: 14, fillColor: AGENT_COLOR },
      { id: "act", label: "Act", positionX: 140, positionY: 88, radius: 14, fillColor: "oklch(0.58 0.15 200)" },
      { id: "observe", label: "Observe", positionX: 140, positionY: 122, radius: 14, fillColor: MERGE_COLOR },
      { id: "reason-2", label: "Reason", positionX: 140, positionY: 152, radius: 12, fillColor: AGENT_COLOR },
      { id: "answer", label: "Answer", positionX: 140, positionY: 182, radius: 14, fillColor: RESULT_COLOR },
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
    viewBoxWidth: 280,
    viewBoxHeight: 224,
    nodes: [
      { id: "prompt", label: "Prompt", positionX: 140, positionY: 20, radius: 16, fillColor: ORCHESTRATOR_COLOR },
      { id: "branch-a", label: "A", positionX: 60, positionY: 60, radius: 13, fillColor: AGENT_COLOR },
      { id: "branch-b", label: "B", positionX: 140, positionY: 60, radius: 13, fillColor: AGENT_COLOR },
      { id: "branch-c", label: "C", positionX: 220, positionY: 60, radius: 13, fillColor: AGENT_COLOR },
      { id: "score", label: "Score", positionX: 140, positionY: 98, radius: 14, fillColor: MERGE_COLOR },
      { id: "best", label: "Best", positionX: 140, positionY: 130, radius: 13, fillColor: RESULT_COLOR },
      { id: "act", label: "Act", positionX: 140, positionY: 160, radius: 13, fillColor: "oklch(0.58 0.15 200)" },
      { id: "validate", label: "Valid?", positionX: 140, positionY: 192, radius: 14, fillColor: "oklch(0.55 0.14 90)" },
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
    viewBoxWidth: 280,
    viewBoxHeight: 224,
    nodes: [
      { id: "prompt", label: "Prompt", positionX: 140, positionY: 20, radius: 16, fillColor: ORCHESTRATOR_COLOR },
      { id: "branch-a", label: "A", positionX: 60, positionY: 60, radius: 13, fillColor: AGENT_COLOR },
      { id: "branch-b", label: "B", positionX: 140, positionY: 60, radius: 13, fillColor: AGENT_COLOR },
      { id: "branch-c", label: "C", positionX: 220, positionY: 60, radius: 13, fillColor: AGENT_COLOR },
      { id: "score", label: "Score", positionX: 140, positionY: 98, radius: 14, fillColor: MERGE_COLOR },
      { id: "merge", label: "Merge", positionX: 140, positionY: 130, radius: 14, fillColor: "oklch(0.58 0.16 330)" },
      { id: "synth", label: "Synth", positionX: 140, positionY: 162, radius: 13, fillColor: RESULT_COLOR },
      { id: "act", label: "Act", positionX: 140, positionY: 194, radius: 13, fillColor: "oklch(0.58 0.15 200)" },
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
    viewBoxWidth: 280,
    viewBoxHeight: 194,
    nodes: [
      { id: "orchestrator", label: "Orch", positionX: 140, positionY: 20, radius: 16, fillColor: ORCHESTRATOR_COLOR },
      { id: "agent-a", label: "A", positionX: 60, positionY: 70, radius: 14, fillColor: AGENT_COLOR },
      { id: "agent-b", label: "B", positionX: 140, positionY: 70, radius: 14, fillColor: AGENT_COLOR },
      { id: "agent-c", label: "C", positionX: 220, positionY: 70, radius: 14, fillColor: AGENT_COLOR },
      { id: "judge", label: "Judge", positionX: 140, positionY: 126, radius: 15, fillColor: MERGE_COLOR },
      { id: "winner", label: "Winner", positionX: 140, positionY: 168, radius: 14, fillColor: RESULT_COLOR },
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
    viewBoxWidth: 280,
    viewBoxHeight: 194,
    nodes: [
      { id: "orchestrator", label: "Orch", positionX: 140, positionY: 20, radius: 16, fillColor: ORCHESTRATOR_COLOR },
      { id: "actor", label: "Actor", positionX: 140, positionY: 68, radius: 15, fillColor: AGENT_COLOR },
      { id: "critic", label: "Critic", positionX: 140, positionY: 118, radius: 15, fillColor: MERGE_COLOR },
      { id: "result", label: "Pass", positionX: 140, positionY: 168, radius: 14, fillColor: RESULT_COLOR },
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
    viewBoxWidth: 280,
    viewBoxHeight: 214,
    nodes: [
      { id: "orchestrator", label: "Orch", positionX: 140, positionY: 20, radius: 16, fillColor: ORCHESTRATOR_COLOR },
      { id: "planner", label: "Plan", positionX: 140, positionY: 60, radius: 14, fillColor: "oklch(0.58 0.15 200)" },
      { id: "task-a", label: "T₁", positionX: 60, positionY: 108, radius: 13, fillColor: AGENT_COLOR },
      { id: "task-b", label: "T₂", positionX: 140, positionY: 108, radius: 13, fillColor: AGENT_COLOR },
      { id: "task-c", label: "T₃", positionX: 220, positionY: 108, radius: 13, fillColor: AGENT_COLOR },
      { id: "synth", label: "Synth", positionX: 140, positionY: 154, radius: 15, fillColor: MERGE_COLOR },
      { id: "result", label: "Result", positionX: 140, positionY: 192, radius: 14, fillColor: RESULT_COLOR },
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
    viewBoxWidth: 280,
    viewBoxHeight: 234,
    nodes: [
      { id: "orchestrator", label: "Orch", positionX: 140, positionY: 20, radius: 16, fillColor: ORCHESTRATOR_COLOR },
      { id: "branch-a1", label: "B₁", positionX: 60, positionY: 62, radius: 12, fillColor: AGENT_COLOR },
      { id: "branch-b1", label: "B₂", positionX: 140, positionY: 62, radius: 12, fillColor: AGENT_COLOR },
      { id: "branch-c1", label: "B₃", positionX: 220, positionY: 62, radius: 12, fillColor: AGENT_COLOR },
      { id: "eval-1", label: "Eval", positionX: 140, positionY: 102, radius: 13, fillColor: MERGE_COLOR },
      { id: "best-1", label: "Best", positionX: 140, positionY: 138, radius: 12, fillColor: RESULT_COLOR },
      { id: "branch-a2", label: "B₁'", positionX: 80, positionY: 172, radius: 11, fillColor: AGENT_COLOR },
      { id: "branch-b2", label: "B₂'", positionX: 200, positionY: 172, radius: 11, fillColor: AGENT_COLOR },
      { id: "eval-2", label: "Eval", positionX: 140, positionY: 204, radius: 13, fillColor: MERGE_COLOR },
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
            markerWidth="6"
            markerHeight="5"
            refX="5"
            refY="2.5"
            orient="auto"
          >
            <polygon
              points="0 0, 6 2.5, 0 5"
              fill="oklch(0.7 0 0 / 0.6)"
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
                stroke="oklch(0.7 0 0 / 0.25)"
                strokeWidth={1.5}
                fill="none"
                className={styles["topology-edge-line"]}
                markerEnd={`url(#topology-arrowhead-${topologyId})`}
              />
              {edge.isBidirectional && (
                <path
                  d={edgePath}
                  stroke="oklch(0.7 0 0 / 0.15)"
                  strokeWidth={1}
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
              fill={node.fillColor}
              opacity={0.9}
            />
            <circle
              cx={node.positionX}
              cy={node.positionY}
              r={node.radius}
              fill="none"
              stroke="oklch(1 0 0 / 0.12)"
              strokeWidth={1}
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
