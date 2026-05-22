import re

file_path = "/home/rodrigo/development/prism-client/src/app/workflows/page.tsx"
with open(file_path, "r") as f:
    content = f.read()

# Fix Tool arrays
content = content.replace("[custom, builtIn]: [unknown[], unknown[]]", "[custom, builtIn]: [any[], string[]]")

# Fix buildConversationPorts type
content = content.replace("buildConversationPorts(\n              value,", "buildConversationPorts(\n              value as Message[],")

# Revert executeWorkflow cast
content = content.replace("executeWorkflow(nodes, edges, {", "executeWorkflow(nodes as any, edges as any, {")

# Fix targetModality index issue
content = content.replace("[conn.targetModality]: data,", "[conn.targetModality as string]: data,")

# Fix setNodeResults type
content = content.replace("setNodeResults(wf.nodeResults || {});", "setNodeResults((wf.nodeResults as Record<string, Record<string, unknown>>) || {});")

# Fix saveWorkflow
content = content.replace("await WorkflowService.saveWorkflow(workflow);", "await WorkflowService.saveWorkflow(workflow as any);")

# Fix connections edge array props
content = content.replace("connections={edges}", "connections={edges as any}")
content = content.replace("onAddConnection={handleAddEdge}", "onAddConnection={handleAddEdge as any}")

# Fix targetModality string | undefined
content = content.replace("newPorts.has(c.targetModality)", "newPorts.has(c.targetModality as string)")
content = content.replace("conn.sourceNodeId", "conn.sourceNodeId!")

with open(file_path, "w") as f:
    f.write(content)
