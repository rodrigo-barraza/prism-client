import re

file_path = "/home/rodrigo/development/prism-client/src/components/SynthesisComponent.tsx"
with open(file_path, "r") as f:
    content = f.read()

# Make sure imports are there
if "Message, SynthesisRun" not in content:
    content = content.replace('import { SETTINGS_DEFAULTS', 'import { Message, SynthesisRun, LocalModelConfig } from "../types/types";\nimport { SETTINGS_DEFAULTS')

# Fix state hooks
content = content.replace("const [config, setConfig] = useState<any>(null);", "const [config, setConfig] = useState<LocalModelConfig | null>(null);")
content = content.replace("const [seedMessages, setSeedMessages] = useState<any[]>([]);", "const [seedMessages, setSeedMessages] = useState<Message[]>([]);")
content = content.replace("const [generatedMessages, setGeneratedMessages] = useState<any[]>([]);", "const [generatedMessages, setGeneratedMessages] = useState<(Message & { _streaming?: boolean })[]>([]);")
content = content.replace("const [synthesisConversations, setSynthesisConversations] = useState<any[]>(\n    [],\n  );", "const [synthesisConversations, setSynthesisConversations] = useState<SynthesisRun[]>([]);")

content = content.replace("const abortRef = useRef<any>(null);", "const abortRef = useRef<(() => void) | null>(null);")
content = content.replace("const messagesEndRef = useRef<any>(null);", "const messagesEndRef = useRef<HTMLDivElement | null>(null);")
content = content.replace("const [conversationId, setConversationId] = useState(null);", "const [conversationId, setConversationId] = useState<string | null>(null);")
content = content.replace("const [activeHistoryId, setActiveHistoryId] = useState(null);", "const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);")

# API callback typing
content = content.replace("onConfig: (config: any) =>", "onConfig: (config: LocalModelConfig) =>")
content = content.replace("onLocalMerge: (merged: any) =>", "onLocalMerge: (merged: LocalModelConfig) =>")
content = content.replace(".then((favs: any[]) => setFavoriteKeys(favs.map((f: any) => f.key)))", ".then((favs: {key: string}[]) => setFavoriteKeys(favs.map((f: {key: string}) => f.key)))")

# Message mapping fixes
content = content.replace("(prev) => prev.filter((k: any)", "(prev) => prev.filter((k: string)")
content = content.replace("role: (m as any).role, content: (m as any).content", "role: m.role, content: m.content")
content = content.replace("updateSeedMessage = useCallback(\n    (index: any, field: any, value: any)", "updateSeedMessage = useCallback(\n    (index: number, field: keyof Message, value: string)")
content = content.replace("prev.map((m: any, i: any)", "prev.map((m: Message, i: number)")
content = content.replace("removeSeedMessage = useCallback((index: any)", "removeSeedMessage = useCallback((index: number)")
content = content.replace("prev.filter((_: any, i: any)", "prev.filter((_: unknown, i: number)")

content = content.replace("loadSeedTemplate = useCallback((seed: any)", "loadSeedTemplate = useCallback((seed: { system: string; messages: Message[]; category: string })")
content = content.replace("seed.messages.map((m: any) =>", "seed.messages.map((m: Message) =>")
content = content.replace("filter((m: any) => m.content.trim())", "filter((m: Message) => m.content && m.content.trim())")
content = content.replace("map((m: any) => ({ role: m.role, content: m.content }))", "map((m: Message) => ({ role: m.role, content: m.content }))")
content = content.replace("(partial: any) => {", "(partial: string) => {")
content = content.replace("onThinking: (chunk: any)", "onThinking: (chunk: string)")

content = content.replace("conversation.map((m: any)", "conversation.map((m: Message)")
content = content.replace("} as any", "} as Message")
content = content.replace("m._streaming", "(m as Message & { _streaming?: boolean })._streaming")

content = content.replace("handleSelectHistory = useCallback(async (run: any)", "handleSelectHistory = useCallback(async (run: SynthesisRun)")
content = content.replace("filter((c: any) =>", "filter((c: SynthesisRun) =>")

content = content.replace("updateGeneratedMessage = useCallback((index: any, content: any)", "updateGeneratedMessage = useCallback((index: number, content: string)")
content = content.replace("removeGeneratedMessage = useCallback((index: any)", "removeGeneratedMessage = useCallback((index: number)")

content = content.replace("onChange={(updates: any)", "onChange={(updates: Record<string, unknown>)")
content = content.replace("setSettings((s: any)", "setSettings((s: typeof settings)")

content = content.replace("catch (error: any)", "catch (error: unknown | Error)")
content = content.replace("(error as any).name", "(error as Error).name")
content = content.replace("(error as any).message", "(error as Error).message")

with open(file_path, "w") as f:
    f.write(content)
