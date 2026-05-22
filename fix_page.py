import re

file_path = "/home/rodrigo/development/prism-client/src/app/workflows/page.tsx"
with open(file_path, "r") as f:
    content = f.read()

# Add Message to imports
content = content.replace("type { Workflow as IWorkflow, WorkflowNode, WorkflowEdge, PrismConfig }", "type { Workflow as IWorkflow, WorkflowNode, WorkflowEdge, PrismConfig, Message }")

# Type fixes
content = content.replace("function flattenConfigModels(config: any)", "function flattenConfigModels(config: PrismConfig)")
content = content.replace("for (const [provider, models] of Object.entries(providers) as [string, any][])", "for (const [provider, models] of Object.entries(providers) as [string, Record<string, unknown>[]][])")
content = content.replace("function buildConversationPorts(messages: any,", "function buildConversationPorts(messages: Message[],")

content = content.replace("const [_config, setConfig] = useState<any>(null);", "const [_config, setConfig] = useState<PrismConfig | null>(null);")
content = content.replace("const [allModels, setAllModels] = useState<any[]>([]);", "const [allModels, setAllModels] = useState<Record<string, unknown>[]>([]);")

content = content.replace("const [nodeStatuses, setNodeStatuses] = useState<any>({});", "const [nodeStatuses, setNodeStatuses] = useState<Record<string, string>>({});")
content = content.replace("const [nodeResults, setNodeResults] = useState<any>({});", "const [nodeResults, setNodeResults] = useState<Record<string, Record<string, unknown>>>({});")

content = content.replace(".then((wfs: { _id?: string; id?: string; [key: string]: any }[])", ".then((wfs: { _id?: string; id?: string; [key: string]: unknown }[])")

# Initial workflow load
content = content.replace(".then((wf: any) => {", ".then((wf: IWorkflow & { userContent?: string }) => {")

content = content.replace("} catch (error: any) {", "} catch (error: unknown | Error) {")

content = content.replace("const currentStateRef = useRef<any>({", "const currentStateRef = useRef<UndoSnapshot>({")

content = content.replace("handleAddAsset = useCallback(\n    (modality: any, type: any)", "handleAddAsset = useCallback(\n    (modality: string, type: string)")

content = content.replace("defaultModel as any", "defaultModel as Record<string, unknown>")

# Tool loading
content = content.replace(".then(([custom, builtIn]: any) => {", ".then(([custom, builtIn]: [unknown[], unknown[]]) => {")

# Node content updates
content = content.replace("handleUpdateNodeContent = useCallback((nodeId: any, content: any)", "handleUpdateNodeContent = useCallback((nodeId: string, content: string)")
content = content.replace("async (nodeId: any, content: any, mimeType: any)", "async (nodeId: string, content: string, mimeType: string)")

content = content.replace("handleUpdateNodeConfig = useCallback(\n    (nodeId: any, key: any, value: any)", "handleUpdateNodeConfig = useCallback(\n    (nodeId: string, key: string, value: unknown)")

content = content.replace("executeWorkflow(nodes as any, edges as any,", "executeWorkflow(nodes, edges,")
content = content.replace("onNodeStart: (nodeId: any)", "onNodeStart: (nodeId: string)")
content = content.replace("setNodeStatuses((prev: any)", "setNodeStatuses((prev: Record<string, string>)")
content = content.replace("onNodeComplete: (nodeId: any, outputs: any)", "onNodeComplete: (nodeId: string, outputs: Record<string, unknown>)")
content = content.replace("setNodeResults((prev: any)", "setNodeResults((prev: Record<string, Record<string, unknown>>)")
content = content.replace("const receivedOutputs: any = {};", "const receivedOutputs: Record<string, unknown> = {};")
content = content.replace("onNodeError: (nodeId: any, error: any)", "onNodeError: (nodeId: string, error: Error)")
content = content.replace("onViewerPartial: (viewerNodeId: any, partialOutputs: any)", "onViewerPartial: (viewerNodeId: string, partialOutputs: Record<string, unknown>)")
content = content.replace("onNodeContentUpdate: (nodeId: any, newContent: any)", "onNodeContentUpdate: (nodeId: string, newContent: string)")

content = content.replace("handleUpdateNodePosition = useCallback((nodeId: any, position: any)", "handleUpdateNodePosition = useCallback((nodeId: string, position: { x: number, y: number })")
content = content.replace("handleDeleteNode = useCallback((nodeId: any)", "handleDeleteNode = useCallback((nodeId: string)")
content = content.replace("handleAddEdge = useCallback(\n    (conn: any)", "handleAddEdge = useCallback(\n    (conn: WorkflowEdge)")

content = content.replace("setEdges((prevEdges: any) =>\n            prevEdges.filter((c: any)", "setEdges((prevEdges) =>\n            prevEdges.filter((c: WorkflowEdge)")

content = content.replace("delete (receivedOutputs as Record<string, any>)[deleted.targetModality as string];", "delete (receivedOutputs as Record<string, unknown>)[deleted.targetModality as string];")

# Another error cast
content = content.replace("const data = JSON.parse(raw);", "const data = JSON.parse(raw) as Record<string, unknown>;")

content = content.replace("data.messages", "(data.messages as Message[])")
content = content.replace("(data.messages as Message[]).length", "(data.messages as Message[])?.length")
content = content.replace("data.model", "(data.model as string)")
content = content.replace("data.provider", "(data.provider as string)")
content = content.replace("data.title", "(data.title as string)")

content = content.replace("nodes as any", "nodes")
content = content.replace("edges as any", "edges")
content = content.replace("as any[]", "as unknown[]")
content = content.replace("as [string, any][]", "as [string, unknown][]")
content = content.replace("nodes as any[]", "nodes")

content = content.replace("} catch (error: any)", "} catch (error: unknown | Error)")

content = content.replace("""catch (error: any) {
      addToast(`Execution failed: ${(error as Error).message}`, "error");""", """catch (error: unknown | Error) {
      addToast(`Execution failed: ${(error as Error).message}`, "error");""")

with open(file_path, "w") as f:
    f.write(content)
