import re

file_path = "/home/rodrigo/development/prism-client/src/components/ModelsTableComponent.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. formatPricingRate: n -> rateValue
content = content.replace("function formatPricingRate(n: number | null | undefined): string", "function formatPricingRate(rateValue: number | null | undefined): string")
content = content.replace("if (n == null) return", "if (rateValue == null) return")
content = content.replace("const formatted = n.toFixed(4)", "const formatted = rateValue.toFixed(4)")

# 2. parseSize, extractQuantization, stripQuantSuffix, parseParams: str -> sizeString/quantizationString/paramsString
content = content.replace("function parseSize(str: string | null | undefined)", "function parseSize(sizeString: string | null | undefined)")
content = content.replace("if (!str) return 0;\n  const match = str.match", "if (!sizeString) return 0;\n  const match = sizeString.match")
content = content.replace("parseFloat(match[1]) * 1024 * 1024 * 1024", "parseFloat(match[1]) * 1024 * 1024 * 1024")
content = content.replace("parseFloat(match[1]) * 1024 * 1024", "parseFloat(match[1]) * 1024 * 1024")
content = content.replace("parseFloat(match[1]) * 1024", "parseFloat(match[1]) * 1024")
content = content.replace("parseFloat(str) || 0", "parseFloat(sizeString) || 0")

content = content.replace("function extractQuantization(str: string | null | undefined): string | null", "function extractQuantization(quantizationString: string | null | undefined): string | null")
content = content.replace("if (!str) return null;\n  const match = str.match", "if (!quantizationString) return null;\n  const match = quantizationString.match")

content = content.replace("function stripQuantSuffix(str: string | null | undefined): string", "function stripQuantSuffix(quantizationString: string | null | undefined): string")
content = content.replace("if (!str) return \"\";\n  return str.replace", "if (!quantizationString) return \"\";\n  return quantizationString.replace")

content = content.replace("function parseParams(str: string | null | undefined): number", "function parseParams(paramsString: string | null | undefined): number")
content = content.replace("if (!str) return 0;\n  const match = str.match", "if (!paramsString) return 0;\n  const match = paramsString.match")
content = content.replace("parseFloat(match[1]) : parseFloat(str)", "parseFloat(match[1]) : parseFloat(paramsString)")

# 3. inputTypes.map((t: string) => ...
content = content.replace("{(inputTypes || []).map((t: string) => {", "{(inputTypes || []).map((inputType: string) => {")
content = content.replace(")[t];", ")[inputType];")
content = content.replace("key={`in-${t}`}", "key={`in-${inputType}`}")
content = content.replace("[t] }}", "[inputType] }}")
content = content.replace("(t: string) => {\n            const meta = (MODALITY_ICONS as Record<string, any>)[t];", "(inputType: string) => {\n            const meta = (MODALITY_ICONS as Record<string, any>)[inputType];")

# outputTypes.map((t: string) => ...
content = content.replace("{(outputTypes || []).map((t: string) => {", "{(outputTypes || []).map((outputType: string) => {")
content = content.replace("key={`out-${t}`}", "key={`out-${outputType}`}")
content = content.replace("const meta = (MODALITY_ICONS as Record<string, any>)[t];", "const meta = (MODALITY_ICONS as Record<string, any>)[outputType];")
content = content.replace("(MODALITY_COLORS as Record<string, string>)[t]", "(MODALITY_COLORS as Record<string, string>)[outputType]")

# 4. arenaCol -> arenaColumn
content = content.replace("arenaCol", "arenaColumn")

# 5. allColumns.filter((c) => ...
content = content.replace("allColumns.filter((c) => COMPACT_KEYS.includes(c.key))", "allColumns.filter((column) => COMPACT_KEYS.includes(column.key))")

# 6. col -> column
content = content.replace("for (const col of ARENA_COLUMNS) {", "for (const column of ARENA_COLUMNS) {")
content = content.replace("row[col.key] = rawModel.arena?.[col.dataKey]", "row[column.key] = rawModel.arena?.[column.dataKey]")
content = content.replace("ARENA_COLUMNS.filter((col) =>", "ARENA_COLUMNS.filter((column) =>")
content = content.replace("m.arena[col.dataKey] != null", "m.arena[column.dataKey] != null")

# 7. hasBpw -> hasBitsPerWeight
content = content.replace("hasBpw", "hasBitsPerWeight")

# 8. p -> provider
content = content.replace("allProviders.map((p: string) => ({", "allProviders.map((provider: string) => ({")
content = content.replace("key: p,", "key: provider,")
content = content.replace("icon: () => <ProviderLogo provider={p} size={13} />,", "icon: () => <ProviderLogo provider={provider} size={13} />,")
content = content.replace("title: resolveProviderLabel(p),", "title: resolveProviderLabel(provider),")

# 9. prev -> previousFavoritesOnly
content = content.replace("setShowFavoritesOnly((prev: boolean) => !prev)", "setShowFavoritesOnly((previousFavoritesOnly: boolean) => !previousFavoritesOnly)")

# 10. sorting: a, b -> itemA, itemB
content = content.replace(".sort((a: string, b: string) => {", ".sort((itemA: string, itemB: string) => {")
content = content.replace("const ai = labelOrder.indexOf(a);", "const ai = labelOrder.indexOf(itemA);")
content = content.replace("const bi = labelOrder.indexOf(b);", "const bi = labelOrder.indexOf(itemB);")
content = content.replace("const ai = iconOrder.indexOf(a);", "const ai = iconOrder.indexOf(itemA);")
content = content.replace("const bi = iconOrder.indexOf(b);", "const bi = iconOrder.indexOf(itemB);")
content = content.replace("return ai - bi;", "return ai - bi;")

# 11. m -> model in models.reduce, getRowKey, etc.
content = content.replace("(s: number, m: RawModel) => s + (m.totalRequests || 0)", "(sum: number, model: RawModel) => sum + (model.totalRequests || 0)")
content = content.replace("models.reduce((s: number, m: RawModel) => s + (m.totalCost || 0), 0)", "models.reduce((sum: number, model: RawModel) => sum + (model.totalCost || 0), 0)")
content = content.replace("getRowKey={(m: RawModel, i: number) => `${m.provider}-${m.model}-${i}`}", "getRowKey={(model: RawModel, index: number) => `${model.provider}-${model.model}-${index}`}")

# for loops and filters
content = content.replace("for (const m of models) {", "for (const model of models) {")
content = content.replace("const providerKey = normalizeModel(m).provider;", "const providerKey = normalizeModel(model).provider;")
content = content.replace("for (const t of m.inputTypes || []) set.add(t);", "for (const inputType of model.inputTypes || []) set.add(inputType);")
content = content.replace("for (const t of m.outputTypes || []) set.add(t);", "for (const outputType of model.outputTypes || []) set.add(outputType);")
content = content.replace("for (const t of m.tools || []) set.add(t);", "for (const toolName of model.tools || []) set.add(toolName);")

content = content.replace("? models.filter((m: RawModel) => {", "? models.filter((model: RawModel) => {")
content = content.replace("const key = `${normalizeModel(m).provider}:${normalizeModel(m).key}`;", "const key = `${normalizeModel(model).provider}:${normalizeModel(model).key}`;")

content = content.replace("(m: RawModel) =>", "(model: RawModel) =>")
content = content.replace("(m.inputTypes || []).includes(activeModality) ||", "(model.inputTypes || []).includes(activeModality) ||")
content = content.replace("(m.outputTypes || []).includes(activeModality),", "(model.outputTypes || []).includes(activeModality),")

# other general m -> model conversions
content = re.sub(r'\bmodels\.filter\(\(m\)\s*=>\s*m\.provider\b', 'models.filter((model) => model.provider', content)
content = re.sub(r'\bmodels\.filter\(\(m: RawModel\)\s*=>\s*m\.provider\b', 'models.filter((model: RawModel) => model.provider', content)

# 12. tools render (.map((t: string) => ...)
content = content.replace(".map((t: string) => {", ".map((toolName: string) => {")
content = content.replace("const meta = (TOOL_ICONS as Record<string, any>)[t];", "const meta = (TOOL_ICONS as Record<string, any>)[toolName];")
content = content.replace("const color = (TOOL_COLORS as Record<string, string>)[t];", "const color = (TOOL_COLORS as Record<string, string>)[toolName];")
content = content.replace("key: t,", "key: toolName,")
content = content.replace("title: t,", "title: toolName,")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("ModelsTableComponent.tsx refactored.")
