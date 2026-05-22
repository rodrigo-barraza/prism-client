import re

file_path = "/home/rodrigo/development/prism-client/src/components/WorkflowCanvasComponent.tsx"
with open(file_path, "r") as f:
    content = f.read()

# Fix expandedInputs useState
content = content.replace("const [expandedInputs, setExpandedInputs] = useState(() => {", "const [expandedInputs, setExpandedInputs] = useState<Set<string>>(() => {")
content = content.replace("return new Set();", "return new Set<string>();")
content = content.replace("const next = new Set();", "const next = new Set<string>();")
content = content.replace("const next = new Set(prev);", "const next = new Set<string>(prev);")

# Fix clipboardRef
content = content.replace("const clipboardRef = useRef<HTMLDivElement | null>(null);", "const clipboardRef = useRef<IWorkflowNode | null>(null);")

# Fix position undefined check
content = content.replace("node.position.x", "(node.position?.x || 0)")
content = content.replace("node.position.y", "(node.position?.y || 0)")
content = content.replace("...nB.position", "...(nB.position || {x:0, y:0})")
content = content.replace("...nA.position", "...(nA.position || {x:0, y:0})")

# Fix collisionTickRef requestAnimationFrame
content = content.replace("requestAnimationFrame(collisionTickRef.current)", "requestAnimationFrame(collisionTickRef.current as FrameRequestCallback)")

# Fix e.target element types
content = content.replace("const element = e.target;", "const element = e.target as HTMLElement;")
content = content.replace("if (!(container)?.contains(e.target)) return;", "if (!(container)?.contains(e.target as Node)) return;")
content = content.replace("const element = e.target;\n        const isInsideNode = element.closest", "const element = e.target as HTMLElement;\n        const isInsideNode = element?.closest")
content = content.replace("const tag = e.target.tagName;", "const tag = (e.target as HTMLElement)?.tagName;")
content = content.replace("e.target.isContentEditable", "(e.target as HTMLElement)?.isContentEditable")

# Fix touchRef assignment
content = content.replace('touchRef.current = { type: "drag", nodeId };', 'touchRef.current = { type: "drag", nodeId, lastDist: 0 };')

# Fix nA.position and nB.position
content = content.replace("nA.position.x", "(nA.position?.x || 0)")
content = content.replace("nA.position.y", "(nA.position?.y || 0)")
content = content.replace("nB.position.x", "(nB.position?.x || 0)")
content = content.replace("nB.position.y", "(nB.position?.y || 0)")

with open(file_path, "w") as f:
    f.write(content)
