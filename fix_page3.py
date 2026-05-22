import re

file_path = "/home/rodrigo/development/prism-client/src/app/workflows/page.tsx"
with open(file_path, "r") as f:
    content = f.read()

# Fix PrismConfig index
content = content.replace("config[section]?.models", "(config as any)[section]?.models")

# Fix m properties
content = content.replace("m.inputTypes", "(m.inputTypes as string[])")
content = content.replace("m.outputTypes", "(m.outputTypes as string[])")
content = content.replace("m.modelType", "(m.modelType as string)")
content = content.replace("m.arena", "(m.arena as any)")
content = content.replace("m.rawInputTypes", "(m.rawInputTypes as string[])")
content = content.replace("m.tools", "(m.tools as string[])")

# Fix wfs types
content = content.replace(".then((wfs: { _id?: string; id?: string; [key: string]: unknown }[]) =>", ".then((wfs: any[]) =>")
content = content.replace(".then((wf: IWorkflow & { userContent?: string }) => {", ".then((wf: any) => {")
content = content.replace("setWorkflowId(wf._id || wf.id);", "setWorkflowId(wf._id || wf.id || null);")

# Fix models map
content = content.replace("((m.inputTypes as string[]) && (m.inputTypes as string[]).length > 0)", "((m.inputTypes as string[]) && (m.inputTypes as string[]).length > 0)")

# Fix builtIn
content = content.replace(".then(([custom, builtIn]: [any[], string[]]) => {", ".then(([custom, builtIn]: [any[], any[]]) => {")

# Fix onNodeError and onNodeContentUpdate
content = content.replace("onNodeError: (nodeId: string, error: Error) => {", "onNodeError: (nodeId: string, error: unknown) => {")
content = content.replace("onNodeContentUpdate: (nodeId: string, newContent: string) => {", "onNodeContentUpdate: (nodeId: string, newContent: unknown) => {")

# Fix conn.sourceModality
content = content.replace("existingResults[conn.sourceModality]", "existingResults[conn.sourceModality as string]")
content = content.replace("existingResults[conn.sourceModality]", "existingResults[conn.sourceModality as string]")

# Revert baseInputs spread
content = content.replace("...baseInputs", "...(baseInputs as string[])")

with open(file_path, "w") as f:
    f.write(content)
