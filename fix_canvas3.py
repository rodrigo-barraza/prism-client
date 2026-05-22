import re

# 1. Update types.ts
types_path = "/home/rodrigo/development/prism-client/src/types/types.ts"
with open(types_path, "r") as f:
    types_content = f.read()

if "export interface WorkflowConnection" not in types_content:
    types_content = types_content.replace('export interface WorkflowNode {', '''export interface WorkflowConnection {
  id?: string;
  sourceNodeId: string;
  sourceModality: string;
  targetNodeId: string;
  targetModality: string;
}

export interface WorkflowNode {''')
    with open(types_path, "w") as f:
        f.write(types_content)

# 2. Update WorkflowCanvasComponent.tsx
canvas_path = "/home/rodrigo/development/prism-client/src/components/WorkflowCanvasComponent.tsx"
with open(canvas_path, "r") as f:
    canvas = f.read()

# Fix prop signatures to match what page.tsx passes
canvas = canvas.replace("onUpdateNodeConfig?: (nodeId: string, config: any) => void;", "onUpdateNodeConfig?: (nodeId: string, key: string, value: any) => void;")
canvas = canvas.replace("onUpdateFileInput?: (nodeId: string, e: React.ChangeEvent<HTMLInputElement>) => void;", "onUpdateFileInput?: (nodeId: string, content: string, mimeType: string) => void;")
canvas = canvas.replace("activeWorkflowId?: string;", "activeWorkflowId?: string | null;")

# Fix activeWorkflowId indexing
canvas = canvas.replace("getStoredViews()[activeWorkflowId]", "getStoredViews()[activeWorkflowId!]")

# Fix element === svgRef.current
canvas = canvas.replace("element === svgRef.current", "element === (svgRef.current as unknown as HTMLElement)")

# Fix container?.contains(e.target)
canvas = canvas.replace("if (!container?.contains(e.target)) return;", "if (!container?.contains(e.target as Node)) return;")
# Or if it was modified previously:
canvas = canvas.replace("if (!(container)?.contains(e.target as Node)) return;", "if (!container?.contains(e.target as Node)) return;")

with open(canvas_path, "w") as f:
    f.write(canvas)
