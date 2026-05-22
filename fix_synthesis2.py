import re

file_path = "/home/rodrigo/development/prism-client/src/components/SynthesisComponent.tsx"
with open(file_path, "r") as f:
    content = f.read()

# Fix PrismConfig
content = content.replace("LocalModelConfig", "PrismConfig")

# Fix addSeedMessage
content = content.replace("addSeedMessage = useCallback((role = \"user\") => {", "addSeedMessage = useCallback((role: Message['role'] = \"user\") => {")

# Fix run.settings
content = content.replace("provider: run.settings.provider", "provider: run.settings?.provider")
content = content.replace("model: run.settings.model", "model: run.settings?.model")
content = content.replace("temperature: run.settings.temperature", "temperature: run.settings?.temperature")

# Fix run.id and run.seedMessages
content = content.replace("if (run.seedMessages) setSeedMessages(run.seedMessages);", "if (run.seedMessages) setSeedMessages(run.seedMessages as Message[]);")
content = content.replace("setActiveHistoryId(run.id);", "if (run.id) setActiveHistoryId(run.id);")

# Fix role in Message[] array in the render function
content = content.replace("""messages={[
                    {
                      role: "system",
                      content:
                        userPersona || "You are a user talking to an AI.",
                    },
                    ...seedMessages.map((m: Message) => ({
                      role: m.role === "user" ? "assistant" : "user",
                      content: m.content,
                    })),
                  ]}""", """messages={[
                    {
                      role: "system" as const,
                      content:
                        userPersona || "You are a user talking to an AI.",
                    },
                    ...seedMessages.map((m: Message) => ({
                      role: (m.role === "user" ? "assistant" : "user") as Message['role'],
                      content: m.content,
                    })),
                  ]}""")

with open(file_path, "w") as f:
    f.write(content)
