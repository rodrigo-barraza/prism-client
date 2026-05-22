import re

file_path = "/home/rodrigo/development/prism-client/src/components/WorkflowCanvasComponent.tsx"
with open(file_path, "r") as f:
    content = f.read()

# Make sure imports are there
if "WorkflowNode" not in content and "types/types" not in content:
    content = content.replace('import WorkflowNode from "./WorkflowNodeComponent";',
                              'import WorkflowNode from "./WorkflowNodeComponent";\nimport { WorkflowNode as IWorkflowNode, WorkflowConnection } from "../types/types";')
else:
    if "IWorkflowNode" not in content:
        content = content.replace('import {', 'import { WorkflowNode as IWorkflowNode, WorkflowConnection } from "../types/types";\nimport {', 1)

# Fix component props
props_replace = """}: {
  nodes: IWorkflowNode[];
  connections: WorkflowConnection[];
  onUpdateNodePosition: (nodeId: string, pos: { x: number; y: number }) => void;
  onDeleteNode: (nodeId: string) => void;
  onAddConnection: (conn: { sourceNodeId: string; sourceModality: string; targetNodeId: string; targetModality: string }) => void;
  onDeleteConnection: (connId: string) => void;
  onUpdateNodeContent?: (nodeId: string, content: string) => void;
  onUpdateNodeConfig?: (nodeId: string, config: any) => void;
  onUpdateFileInput?: (nodeId: string, e: React.ChangeEvent<HTMLInputElement>) => void;
  onDuplicateNode?: (node: IWorkflowNode) => void;
  nodeStatuses?: Record<string, string>;
  nodeResults?: Record<string, unknown>;
  selectedNodeId?: string | null;
  onSelectNode: (nodeId: string) => void;
  activeWorkflowId?: string;
  readOnly?: boolean;
  isLoadingWorkflow?: boolean;
  sidebarVisible?: boolean;
  onToggleSidebar?: () => void;
}) {"""
content = content.replace("}: any) {", props_replace)

# Refs and state
content = content.replace("const svgRef = useRef<any>(null);", "const svgRef = useRef<SVGSVGElement | null>(null);")
content = content.replace("const [dragging, setDragging] = useState<any>(null);", "const [dragging, setDragging] = useState<{nodeId: string, offsetX: number, offsetY: number} | null>(null);")
content = content.replace("const [connecting, setConnecting] = useState<any>(null);", "const [connecting, setConnecting] = useState<{sourceNodeId: string, sourceModality: string, sourceIndex: number} | null>(null);")
content = content.replace("const [connectingMouse, setConnectingMouse] = useState<any>(null);", "const [connectingMouse, setConnectingMouse] = useState<{x: number, y: number} | null>(null);")
content = content.replace("const panStart = useRef<any>({ x: 0, y: 0, panX: 0, panY: 0 });", "const panStart = useRef<{ x: number, y: number, panX: number, panY: number }>({ x: 0, y: 0, panX: 0, panY: 0 });")
content = content.replace("const prevWorkflowIdRef = useRef<any>(activeWorkflowId);", "const prevWorkflowIdRef = useRef<string | undefined>(activeWorkflowId);")
content = content.replace("const touchRef = useRef<any>({ type: null, lastDist: 0, nodeId: null });", "const touchRef = useRef<{ type: string | null, lastDist: number, nodeId: string | null }>({ type: null, lastDist: 0, nodeId: null });")

# Math / callbacks
content = content.replace("screenToSvg = useCallback(\n    (clientX: any, clientY: any)", "screenToSvg = useCallback(\n    (clientX: number, clientY: number)")
content = content.replace("handleNodeMouseDown = useCallback(\n    (e: any, nodeId: any)", "handleNodeMouseDown = useCallback(\n    (e: React.MouseEvent, nodeId: string)")
content = content.replace("handleNodeTouchStart = useCallback(\n    (e: any, nodeId: any)", "handleNodeTouchStart = useCallback(\n    (e: React.TouchEvent, nodeId: string)")
content = content.replace("handleCanvasMouseDown = useCallback(\n    (e: any)", "handleCanvasMouseDown = useCallback(\n    (e: React.MouseEvent)")
content = content.replace("handleMouseMove = useCallback(\n    (e: any)", "handleMouseMove = useCallback(\n    (e: MouseEvent)")
content = content.replace("handleWheel = useCallback((e: any)", "handleWheel = useCallback((e: WheelEvent)")
content = content.replace("handleTouchStart = (e: any)", "handleTouchStart = (e: TouchEvent)")
content = content.replace("handleTouchMove = (e: any)", "handleTouchMove = (e: TouchEvent)")
content = content.replace("handleTouchEnd = (e: any)", "handleTouchEnd = (e: TouchEvent)")
content = content.replace("handleKeyDown = (e: any)", "handleKeyDown = (e: KeyboardEvent)")

content = content.replace("const getTouchDist = (touches: any)", "const getTouchDist = (touches: TouchList)")
content = content.replace("const getTouchCenter = (touches: any, rect: any)", "const getTouchCenter = (touches: TouchList, rect: DOMRect)")

# Array/find callbacks
content = content.replace("(n: any) => n.id === nodeId", "(n: IWorkflowNode) => n.id === nodeId")
content = content.replace("(n: any) => n.id === conn.sourceNodeId", "(n: IWorkflowNode) => n.id === conn.sourceNodeId")
content = content.replace("(n: any) => n.id === conn.targetNodeId", "(n: IWorkflowNode) => n.id === conn.targetNodeId")
content = content.replace("(c: any) => c.targetNodeId === nodeId", "(c: WorkflowConnection) => c.targetNodeId === nodeId")
content = content.replace("(n: any) => n.id === selectedNodeId", "(n: IWorkflowNode) => n.id === selectedNodeId")
content = content.replace("nodes.filter((n: any) =>", "nodes.filter((n: IWorkflowNode) =>")

# Refs and dragging casts
content = content.replace("const nodesRef = useRef<any>(nodes);", "const nodesRef = useRef<IWorkflowNode[]>(nodes);")
content = content.replace("const onUpdatePosRef = useRef<any>(onUpdateNodePosition);", "const onUpdatePosRef = useRef(onUpdateNodePosition);")
content = content.replace("const draggingRef = useRef<any>(dragging);", "const draggingRef = useRef(dragging);")
content = content.replace("const expandedInputsRef = useRef<any>(expandedInputs);", "const expandedInputsRef = useRef<Set<string>>(expandedInputs);")
content = content.replace("const collisionTickRef = useRef<any>(null);", "const collisionTickRef = useRef<(() => void) | null>(null);")

content = content.replace("(dragging as any)", "dragging")
content = content.replace("(connecting as any)", "connecting")
content = content.replace("(container as any)", "container")
content = content.replace("for (const n of nodes as any[])", "for (const n of nodes)")

# Handlers and helper functions
content = content.replace("getNodeBox = (node: any)", "getNodeBox = (node: IWorkflowNode)")
content = content.replace("const zoomRef = useRef<any>(zoom);", "const zoomRef = useRef<number>(zoom);")
content = content.replace("handleOutputPortClick = useCallback(\n    (e: any, nodeId: any, modality: any, index: any)", "handleOutputPortClick = useCallback(\n    (e: React.MouseEvent, nodeId: string, modality: string, index: number)")
content = content.replace("handleInputPortClick = useCallback(\n    (e: any, nodeId: any, modality: any)", "handleInputPortClick = useCallback(\n    (e: React.MouseEvent, nodeId: string, modality: string)")
content = content.replace("handleToggleExpand = useCallback((nodeId: any)", "handleToggleExpand = useCallback((nodeId: string)")
content = content.replace("isNodeExpanded = useCallback(\n    (node: any)", "isNodeExpanded = useCallback(\n    (node: IWorkflowNode)")
content = content.replace("getExpandedOffset = useCallback(\n    (node: any)", "getExpandedOffset = useCallback(\n    (node: IWorkflowNode)")
content = content.replace("renderConnection = (conn: any)", "renderConnection = (conn: WorkflowConnection)")

with open(file_path, "w") as f:
    f.write(content)
