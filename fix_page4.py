import re

file_path = "/home/rodrigo/development/prism-client/src/app/workflows/page.tsx"
with open(file_path, "r") as f:
    content = f.read()

# Fix error cast
content = content.replace("[nodeId]: { error: error.message },", "[nodeId]: { error: (error as Error).message },")

# Fix tools includes
content = content.replace("const supportsFC = (defaultModel as Record<string, unknown>)?.tools?.includes(", "const supportsFC = ((defaultModel as Record<string, unknown>)?.tools as string[])?.includes(")

# Fix newNode as WorkflowNode
content = content.replace("setNodes((prev) => [...prev, newNode as WorkflowNode]);", "setNodes((prev) => [...prev, newNode as unknown as WorkflowNode]);")

with open(file_path, "w") as f:
    f.write(content)
