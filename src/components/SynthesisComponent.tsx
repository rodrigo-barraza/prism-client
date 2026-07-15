"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  FlaskConical,
  Play,
  Square,
  Download,
  Plus,
  Trash2,
  RotateCcw,
  Sparkles,
  MessageSquare,
  User,
  Bot,
  Settings2,
} from "lucide-react";
import PrismService from "../services/PrismService";
import { MESSAGE_ROLES, STORAGE_KEY_MODEL_MEMORY_SYNTHESIS } from "../constants";
import NavigationSidebarComponent from "./NavigationSidebarComponent";
import ThreePanelLayout from "./ThreePanelLayoutComponent";
import SettingsPanel from "./SettingsPanelComponent";
import ModelPickerPopoverComponent from "./ModelPickerPopoverComponent";
import {
  BadgeComponent,
  ButtonComponent,
  CollapsibleBlockComponent,
  CopyButtonComponent,
  EmptyStateComponent,
  IconButtonComponent,
  InputComponent,
  SelectComponent,
  TabBarComponent,
  TextAreaComponent,
} from "@rodrigo-barraza/components-library";

import PromptSectionComponent from "./PromptSectionComponent";

import MessageList from "./MessageListComponent";

import JsonViewerComponent from "./JsonViewerComponent";
import SynthesisHistoryPanel from "./SynthesisHistoryPanelComponent";
import { Message, SynthesisRun, PrismConfig } from "../types/types";

import { generateUUID } from "@rodrigo-barraza/utilities-library";
import { resolveDefaultModel, buildSettingsDefaults } from "../utils/utilities";
import styles from "./SynthesisComponent.module.css";
import useModelMemory from "../hooks/useModelMemory";

const DEFAULT_TURNS = 4;
const MIN_TURNS = 1;
const MAX_TURNS = 500;

const LEFT_TABS = {
  CONFIG: "config",
  OUTPUT: "output",
} as const;

/** Default sampling settings for the synthesis (assistant) model. */
const DEFAULT_SYNTHESIS_SETTINGS = {
  provider: "",
  model: "",
  temperature: 1.0,
  thinkingEnabled: true,
  reasoningEffort: "high",
  thinkingLevel: "high",
  thinkingBudget: "",
  webSearchEnabled: false,
} as const;

const DEFAULT_MAX_TOKENS = 4096;

/** The user-simulation model runs slightly cooler than the assistant. */
const DEFAULT_USER_SIMULATION_TEMPERATURE = 0.9;

const RUN_TITLE_PROMPT_PREVIEW_LENGTH = 60;
const DOWNLOAD_FILENAME_PREFIX = "sft-conversation-";

const SAMPLE_SEEDS = [
  {
    label: "Chatbot with personality",
    system:
      "Bunny is a chatbot that stutters, and acts timid and unsure of its answers.",
    messages: [
      {
        role: MESSAGE_ROLES.USER,
        content: "When was the Library of Alexandria burned down?",
      },
      {
        role: MESSAGE_ROLES.ASSISTANT,
        content:
          "Umm, I-I think that was in 48 BC, b-but I'm not sure, I'm sorry.",
      },
    ],
    category: "Chat",
  },
  {
    label: "Coding assistant",
    system:
      "You are a senior software engineer who explains concepts clearly and provides production-quality code.",
    messages: [
      {
        role: MESSAGE_ROLES.USER,
        content: "How do I implement a debounce function in JavaScript?",
      },
    ],
    category: "Coding",
  },
  {
    label: "Creative writing",
    system:
      "You are a creative writing assistant with a poetic, evocative style. You help users craft vivid prose and poetry.",
    messages: [
      {
        role: MESSAGE_ROLES.USER,
        content: "Write a haiku about the first rain of spring.",
      },
      {
        role: MESSAGE_ROLES.ASSISTANT,
        content:
          "Petrichor rising,\nearth exhales its longest sigh—\nblossoms drink the sky.",
      },
      {
        role: MESSAGE_ROLES.USER,
        content: "Now turn that into a short paragraph of prose.",
      },
    ],
    category: "Creative Writing",
  },
  {
    label: "Brainstorming",
    system:
      "You are an enthusiastic brainstorming partner. You generate creative, diverse ideas and build on the user's suggestions.",
    messages: [
      {
        role: MESSAGE_ROLES.USER,
        content:
          "I need ideas for a mobile app that helps people learn languages through music.",
      },
    ],
    category: "Brainstorm",
  },
  {
    label: "Roleplay - medieval guide",
    system:
      "You are a medieval town guide named Aldric. You speak in an old English dialect and are eager to show travelers around your village.",
    messages: [
      { role: MESSAGE_ROLES.USER, content: "What can I do in this town?" },
      {
        role: MESSAGE_ROLES.ASSISTANT,
        content:
          "Ah, a weary traveler! Welcome, welcome to Thornhollow! Pray, follow me — I shall show thee the finest tavern this side of the King's Road, and mayhaps the blacksmith if thou needst thy blade sharpened.",
      },
      { role: MESSAGE_ROLES.USER, content: "Take me to the tavern." },
    ],
    category: "Chat",
  },
];

const CATEGORY_OPTIONS = [
  { value: "Chat", label: "Chat" },
  { value: "Coding", label: "Coding" },
  { value: "Creative Writing", label: "Creative Writing" },
  { value: "Brainstorm", label: "Brainstorm" },
  { value: "Rewrite", label: "Rewrite" },
  { value: "Summarize", label: "Summarize" },
  { value: "Classify", label: "Classify" },
  { value: "Extract", label: "Extract" },
  { value: "QA", label: "Q&A" },
  { value: "Other", label: "Other" },
];

export default function SynthesisComponent() {
  // -- Config & model state --------------------------------------
  const [config, setConfig] = useState<PrismConfig | null>(null);
  const [settings, setSettings] = useState(() => ({
    ...DEFAULT_SYNTHESIS_SETTINGS,
    ...buildSettingsDefaults(config?.parameterDescriptors),
    maxTokens: DEFAULT_MAX_TOKENS,
  }));

  // Update settings when config loads if they haven't been customized yet
  useEffect(() => {
    if (config?.parameterDescriptors) {
      setSettings(prev => {
        const defaults = buildSettingsDefaults(config.parameterDescriptors);
        return {
          ...DEFAULT_SYNTHESIS_SETTINGS,
          ...defaults,
          ...prev,
        };
      });
    }
  }, [config]);
  const [leftTab, setLeftTab] = useState<string>(LEFT_TABS.CONFIG);

  // -- Model memory (persist last-used model per page) ----------
  const { saveModel, restoreModel } = useModelMemory(STORAGE_KEY_MODEL_MEMORY_SYNTHESIS);

  // -- Synthesis state -------------------------------------------
  const [systemPrompt, setSystemPrompt] = useState("");

  const [userPersona, setUserPersona] = useState("");
  const [useUserSimModel, setUseUserSimModel] = useState(true);
  const [userSimSettings, setUserSimSettings] = useState({
    provider: "",
    model: "",
    temperature: DEFAULT_USER_SIMULATION_TEMPERATURE,
  });
  const [targetTurns, setTargetTurns] = useState<number | "">(DEFAULT_TURNS);
  const [category, setCategory] = useState("Chat");
  const [seedMessages, setSeedMessages] = useState<Message[]>([]);
  const [generatedMessages, setGeneratedMessages] = useState<
    (Message & { _streaming?: boolean })[]
  >([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState("");
  const [seedsExpanded, setSeedsExpanded] = useState(true);
  const [templateExpanded, setTemplateExpanded] = useState(false);

  const abortRef = useRef<(() => void) | null>(null);
  const abortedRef = useRef<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);

  // -- History state ---------------------------------------------
  const [synthesisConversations, setSynthesisConversations] = useState<
    SynthesisRun[]
  >([]);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [favoriteKeys, setFavoriteKeys] = useState<string[]>([]);

  // -- Load synthesis history -------------------------------------
  const loadSynthesisHistory = useCallback(async () => {
    try {
      const runs = await PrismService.getSynthesisRuns();
      setSynthesisConversations(runs);
    } catch (error: unknown | Error) {
      console.error("Failed to load synthesis history:", error);
    }
  }, []);

  // -- Load config -----------------------------------------------
  useEffect(() => {
    PrismService.getConfigWithLocalModels({
      onConfig: (config: PrismConfig) => {
        setConfig(config);
        restoreModel(config, setSettings, {
          fallback: (config) => {
            const { provider, model } = resolveDefaultModel(config, false);
            if (provider && model) {
              setSettings((state) => ({
                ...state,
                provider,
                model,
              }));
            }
          },
        });
      },
      onLocalMerge: (merged: PrismConfig) => {
        setConfig(merged);
        restoreModel(merged, setSettings);
      },
    }).catch(console.error);
    loadSynthesisHistory();

    // Load favorites
    PrismService.getFavorites("model")
      .then((favs: { key: string }[]) =>
        setFavoriteKeys(favs.map((favorite: { key: string }) => favorite.key)),
      )
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // -- Favorites -------------------------------------------------
  const handleToggleFavorite = useCallback(
    async (key: string) => {
      if (favoriteKeys.includes(key)) {
        setFavoriteKeys((previous) => previous.filter((k: string) => k !== key));
        PrismService.removeFavorite("model", key).catch(() => {});
      } else {
        setFavoriteKeys((previous) => [...previous, key]);
        const [provider, ...rest] = key.split(":");
        PrismService.addFavorite("model", key, {
          provider,
          name: rest.join(":"),
        }).catch(() => {});
      }
    },
    [favoriteKeys],
  );

  // -- Filtered config: text-to-text models only -----------------
  const filteredConfig = useMemo(() => {
    if (!config) return null;
    return {
      ...config,
      textToImage: { models: {} },
      textToSpeech: { models: {}, voices: {}, defaultVoices: {} },
      audioToText: { models: {} },
    } as unknown as PrismConfig;
  }, [config]);

  // -- Model selection handler -----------------------------------
  const handleSelectModel = useCallback(
    (provider: string, model: string) => {
      setSettings((state) => ({ ...state, provider, model }));
      saveModel(provider, model);
    },
    [saveModel],
  );

  const handleSelectUserSimModel = useCallback(
    (provider: string, model: string) => {
      setUserSimSettings((state) => ({ ...state, provider, model }));
    },
    [],
  );

  // -- Compute final messages array (SFT format) -----------------
  const sftOutput = useMemo(() => {
    const msgs = [];
    if (systemPrompt.trim()) {
      msgs.push({ role: MESSAGE_ROLES.SYSTEM, content: systemPrompt.trim() });
    }
    // Filter out any internal _streaming flag
    for (const message of generatedMessages) {
      msgs.push({ role: message.role, content: message.content });
    }
    return msgs;
  }, [systemPrompt, generatedMessages]);

  const sftData = useMemo(
    () => ({
      prompt: systemPrompt.trim(),
      prompt_id: generateUUID().replace(/-/g, ""),
      messages: sftOutput,
      category,
    }),
    [sftOutput, category, systemPrompt],
  );

  const sftJsonString = useMemo(
    () => JSON.stringify(sftData, null, 2),
    [sftData],
  );

  // -- Auto-scroll messages --------------------------------------
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [generatedMessages, generationProgress]);

  // -- Seed message management -----------------------------------
  const addSeedMessage = useCallback((role: Message["role"] = "user") => {
    setSeedMessages((previous) => [...previous, { role, content: "" }]);
  }, []);

  const updateSeedMessage = useCallback(
    (index: number, field: keyof Message, value: string) => {
      setSeedMessages((previous) =>
        previous.map((message: Message, i: number) =>
          i === index ? { ...message, [field]: value } : message,
        ),
      );
    },
    [],
  );

  const removeSeedMessage = useCallback((index: number) => {
    setSeedMessages((previous) =>
      previous.filter((_: unknown, i: number) => i !== index),
    );
  }, []);

  const loadSeedTemplate = useCallback(
    (seed: { system: string; messages: Message[]; category: string }) => {
      setSystemPrompt(seed.system);

      setSeedMessages(seed.messages.map((message: Message) => ({ ...message })));
      setCategory(seed.category);
      setGeneratedMessages([]);
      setTemplateExpanded(false);
      setSeedsExpanded(true);
    },
    [],
  );

  // -- Generation logic (server-orchestrated turn loop) -----------
  // The backend owns the synthesis loop (persona prompt, role-swapping,
  // user-simulator model selection, persistence) — see
  // SynthesisOrchestrationService in prism-service (audit H3). This client
  // just renders the role-tagged SSE stream.
  const handleGenerate = useCallback(async () => {
    if (!settings.provider || !settings.model) return;

    setIsGenerating(true);
    setGenerationProgress("");
    abortedRef.current = false;

    // Create a new conversation for this synthesis run
    const convId = generateUUID();
    setConversationId(convId);

    const seeds = seedMessages
      .filter((message: Message) => message.content && message.content.trim())
      .map((message: Message) => ({
        role: message.role,
        content: message.content as string,
      }));

    // Local mirror of completed messages; the in-flight turn renders on top
    let conversation: Message[] = seeds.map(
      (message) => ({ ...message }) as Message,
    );
    setGeneratedMessages([...conversation]);

    let currentRole: string = MESSAGE_ROLES.USER;
    let currentContent = "";
    let currentThinking = "";

    const renderStreamingTurn = () => {
      setGeneratedMessages([
        ...conversation,
        {
          role: currentRole,
          content: currentContent,
          thinking: currentThinking || undefined,
          _streaming: true,
        } as Message,
      ]);
    };

    try {
      await new Promise<void>((resolve, reject) => {
        const cancel = PrismService.streamSynthesis(
          {
            conversationId: convId,
            title: `Synthesis: ${systemPrompt.slice(0, RUN_TITLE_PROMPT_PREVIEW_LENGTH)}`,
            systemPrompt,
            userPersona,
            category,
            targetTurns: Number(targetTurns),
            seedMessages: seeds,
            settings: {
              provider: settings.provider,
              model: settings.model,
              temperature: settings.temperature,
              maxTokens: settings.maxTokens,
              thinkingEnabled: settings.thinkingEnabled,
              reasoningEffort: settings.reasoningEffort,
              thinkingLevel: settings.thinkingLevel,
              thinkingBudget: settings.thinkingBudget,
            },
            // Use separate model for user simulation when enabled
            userSimSettings:
              useUserSimModel &&
              userSimSettings.provider &&
              userSimSettings.model
                ? {
                    provider: userSimSettings.provider,
                    model: userSimSettings.model,
                    temperature: userSimSettings.temperature,
                  }
                : undefined,
          },
          {
            onTurnStart: (role: string) => {
              currentRole = role;
              currentContent = "";
              currentThinking = "";
              renderStreamingTurn();
            },
            onChunk: (content: string) => {
              currentContent += content;
              renderStreamingTurn();
              setGenerationProgress(currentContent);
            },
            onThinking: (chunk: string) => {
              currentThinking += chunk;
              renderStreamingTurn();
            },
            onTurnComplete: (message: Message) => {
              conversation = [...conversation, message];
              setGeneratedMessages([...conversation]);
              setGenerationProgress("");
            },
            onDone: (data) => {
              if (data?.synthesisRunId) {
                setActiveHistoryId(data.synthesisRunId);
              }
              resolve();
            },
            onError: (error: Error) => reject(error),
          },
        );
        // Stopping must also settle this promise — an aborted fetch ends the
        // stream without a done event.
        abortRef.current = () => {
          cancel();
          resolve();
        };
      });

      if (!abortedRef.current) {
        setLeftTab("output");
        loadSynthesisHistory();
      }
    } catch (error: unknown) {
      if (
        (!(error instanceof Error) || error.name !== "AbortError") &&
        !abortedRef.current
      ) {
        setGeneratedMessages((previous) => [
          ...previous.filter(
            (message: Message & { _streaming?: boolean }) => !message._streaming,
          ),
          {
            role: MESSAGE_ROLES.ASSISTANT,
            content: `⚠️ Generation error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ]);
      }
    } finally {
      setIsGenerating(false);
      setGenerationProgress("");
      abortRef.current = null;
    }
  }, [
    settings,
    systemPrompt,

    userPersona,
    category,
    targetTurns,
    seedMessages,
    useUserSimModel,
    userSimSettings,
    loadSynthesisHistory,
  ]);

  const handleStop = useCallback(() => {
    abortedRef.current = true;
    if (abortRef.current && typeof abortRef.current === "function") {
      abortRef.current();
    }
    abortRef.current = null;
    setIsGenerating(false);
    // Clean up any in-flight streaming messages
    setGeneratedMessages((previous) =>
      previous.filter(
        (message: Message & { _streaming?: boolean }) => !message._streaming,
      ),
    );
  }, []);

  const handleReset = useCallback(() => {
    setSeedMessages([]);
    setGeneratedMessages([]);
    setSystemPrompt("");

    setUserPersona("");
    setUseUserSimModel(true);
    setUserSimSettings({ provider: "", model: "", temperature: DEFAULT_USER_SIMULATION_TEMPERATURE });
    setTargetTurns(DEFAULT_TURNS);
    setCategory("Chat");
    setGenerationProgress("");
    setConversationId(null);
    setActiveHistoryId(null);
    setLeftTab("config");
  }, []);

  // -- History selection -----------------------------------------
  const handleSelectHistory = useCallback(async (run: SynthesisRun) => {
    try {
      // Restore the synthesis config
      if (run.systemPrompt) setSystemPrompt(run.systemPrompt);

      if (run.userPersona !== undefined) setUserPersona(run.userPersona);
      if (run.category) setCategory(run.category);
      if (run.targetTurns) setTargetTurns(run.targetTurns);
      if (run.seedMessages) setSeedMessages(run.seedMessages as Message[]);
      if (run.settings) {
        setSettings((state) => ({
          ...state,
          provider: run.settings?.provider || state.provider,
          model: run.settings?.model || state.model,
          temperature: run.settings?.temperature ?? state.temperature,
        }));
      }

      if (run.id) setActiveHistoryId(run.id);
      setConversationId(run.conversationId || null);

      // Load the generated conversation if it exists
      if (run.conversationId) {
        try {
          const full = await PrismService.getConversation(run.conversationId);
          const msgs = (full.messages || []).filter((message) => message.role !== "system");
          setGeneratedMessages(msgs);
          if (msgs.length > 0) setLeftTab("output");
        } catch {
          // Conversation may have been deleted separately
          setGeneratedMessages([]);
          setLeftTab("config");
        }
      } else {
        setGeneratedMessages([]);
        setLeftTab("config");
      }
    } catch (error: unknown | Error) {
      console.error("Failed to load synthesis run:", error);
    }
  }, []);

  const handleDeleteHistory = useCallback(async (id: string) => {
    try {
      await PrismService.deleteSynthesisRun(id);
      setSynthesisConversations((previous) =>
        previous.filter((conversation: SynthesisRun) => conversation.id !== id),
      );
      // If the deleted run is currently active, clear the view
      setActiveHistoryId((previous) => {
        if (previous === id) {
          setGeneratedMessages([]);
          setConversationId(null);
          setLeftTab("config");
          return null;
        }
        return previous;
      });
    } catch (error: unknown | Error) {
      console.error("Failed to delete synthesis run:", error);
    }
  }, []);

  const handleDownload = useCallback(() => {
    const blob = new Blob([sftJsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement("a");
    downloadAnchor.href = url;
    downloadAnchor.download = `${DOWNLOAD_FILENAME_PREFIX}${Date.now()}.json`;
    downloadAnchor.click();
    URL.revokeObjectURL(url);
  }, [sftJsonString]);

  // -- Edit generated message ------------------------------------
  const updateGeneratedMessage = useCallback(
    (index: number, content: string) => {
      setGeneratedMessages((previous) =>
        previous.map((message: Message, i: number) =>
          i === index ? { ...message, content } : message,
        ),
      );
    },
    [],
  );

  const removeGeneratedMessage = useCallback((index: number) => {
    setGeneratedMessages((previous) =>
      previous.filter((_: unknown, i: number) => i !== index),
    );
  }, []);

  // -- Render ----------------------------------------------------

  const leftPanel = (
    <>
      <TabBarComponent
        tabs={[
          { key: LEFT_TABS.CONFIG, label: "Configure" },
          {
            key: LEFT_TABS.OUTPUT,
            label: "Output",
            badge:
              generatedMessages.length > 0
                ? generatedMessages.length
                : undefined,
          },
        ]}
        activeTab={leftTab}
        onChange={setLeftTab}
      />

      {leftTab === LEFT_TABS.CONFIG && (
        <div className={styles['config-panel']}>
          {/* Model selection */}
          <SettingsPanel
            config={filteredConfig}
            settings={settings}
            onChange={(updates: Record<string, unknown>) =>
              setSettings((state: typeof settings) => ({ ...state, ...updates }))
            }
            _hasAssistantImages={false}
          />
        </div>
      )}

      {leftTab === LEFT_TABS.OUTPUT && (
        <div className={styles['output-panel']}>
          {generatedMessages.length > 0 ? (
            <>
              <div className={styles['output-actions']}>
                <CopyButtonComponent
                  text={sftJsonString}
                  showLabel
                  tooltip="Copy SFT JSON"
                  className={styles['output-action-button']}
                />
                <ButtonComponent
                  variant="secondary"
                  icon={Download}
                  onClick={handleDownload}
                  title="Download JSON"
                >
                  Download
                </ButtonComponent>
              </div>
              <JsonViewerComponent data={sftData} label="SFT Output" />
            </>
          ) : (
            <EmptyStateComponent
              icon={<FlaskConical />}
              subtitle="Generate a conversation to see the SFT output here."
              className={styles['output-empty']}
            />
          )}
        </div>
      )}
    </>
  );

  return (
    <main className={`synthesis-component ${styles['app-container']}`}>
      <ThreePanelLayout
        leftTitle={undefined}
        leftPanel={leftPanel}
        rightTitle="History"
        rightPanel={
          <SynthesisHistoryPanel
            conversations={synthesisConversations}
            activeId={activeHistoryId}
            onSelect={handleSelectHistory}
            onDelete={handleDeleteHistory}
          />
        }
        navSidebar={
          <NavigationSidebarComponent mode="user" isGenerating={isGenerating} />
        }
        headerCenter={
          <div className={styles['header-center-group']}>
            <ModelPickerPopoverComponent
              config={filteredConfig}
              settings={settings}
              onSelectModel={handleSelectModel}
              favorites={favoriteKeys}
              onToggleFavorite={handleToggleFavorite}
            />
            <span className={styles['user-sim-label']}>
              <User size={12} />
            </span>
            <ModelPickerPopoverComponent
              config={filteredConfig}
              settings={userSimSettings}
              onSelectModel={handleSelectUserSimModel}
              favorites={favoriteKeys}
              onToggleFavorite={handleToggleFavorite}
            />
          </div>
        }
        headerControls={
          <div className={styles['header-actions']}>
            <ButtonComponent
              variant="secondary"
              icon={RotateCcw}
              onClick={handleReset}
              disabled={isGenerating}
              title="Reset all"
            >
              Reset
            </ButtonComponent>
            {isGenerating ? (
              <ButtonComponent
                variant="destructive"
                icon={Square}
                onClick={handleStop}
              >
                Stop
              </ButtonComponent>
            ) : (
              <ButtonComponent
                variant="primary"
                icon={Play}
                onClick={handleGenerate}
                disabled={!settings.provider || !settings.model}
              >
                Generate
              </ButtonComponent>
            )}
          </div>
        }
      >
        {/* Main area */}
        <div className={styles['workspace']}>
          {/* Conversation Length & Category bar */}
          <div className={styles['config-bar']}>
            <div className={styles['config-bar-item']}>
              <div className={styles['config-bar-label']}>
                <MessageSquare size={13} />
                Length
              </div>
              <div className={styles['config-bar-control']}>
                <InputComponent
                  type="number"
                  className={styles['turns-input']}
                  value={targetTurns}
                  min={MIN_TURNS}
                  max={MAX_TURNS}
                  step={1}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    const raw = e.target.value;
                    if (raw === "") {
                      setTargetTurns("");
                      return;
                    }
                    const parsedValue = parseInt(raw, 10);
                    if (!isNaN(parsedValue)) setTargetTurns(parsedValue);
                  }}
                  onBlur={() => {
                    const clamped = Math.max(
                      MIN_TURNS,
                      Math.min(MAX_TURNS, Number(targetTurns) || DEFAULT_TURNS),
                    );
                    setTargetTurns(clamped);
                  }}
                />
                <span className={styles['turns-value']}>turns</span>
              </div>
            </div>
            <div className={styles['config-bar-item']}>
              <div className={styles['config-bar-label']}>
                <Sparkles size={13} />
                Category
              </div>
              <SelectComponent
                value={category}
                options={CATEGORY_OPTIONS}
                onChange={setCategory}
                placeholder="Select category"
              />
            </div>
          </div>

          {/* System Prompt + User Persona — side by side */}
          <div className={styles['prompt-layout-row']}>
            <PromptSectionComponent
              icon={<Settings2 size={14} />}
              label="System Prompt"
              value={systemPrompt}
              onChange={setSystemPrompt}
              placeholder="Core instructions for the assistant model..."
              rows={3}
            />
            <PromptSectionComponent
              icon={<User size={14} />}
              label="User Persona"
              badge="Optional"
              value={userPersona}
              onChange={setUserPersona}
              placeholder="The simulated user's personality, tone, and style..."
              rows={3}
            />
          </div>

          {/* Seed Templates */}
          <CollapsibleBlockComponent
            icon={<Sparkles size={14} />}
            label="Seed Templates"
            open={templateExpanded}
            onToggle={setTemplateExpanded}
            className={styles['collapsible-section']}
          >
            <div className={styles['template-grid']}>
              {SAMPLE_SEEDS.map((seed) => (
                <button
                  key={seed.label}
                  className={styles['template-card']}
                  onClick={() =>
                    loadSeedTemplate(
                      seed as unknown as {
                        system: string;
                        messages: Message[];
                        category: string;
                      },
                    )
                  }
                >
                  <span className={styles['template-label']}>{seed.label}</span>
                  <span className={styles['template-category']}>
                    {seed.category}
                  </span>
                  <span className={styles['template-message-count']}>
                    {seed.messages.length} messages
                  </span>
                </button>
              ))}
            </div>
          </CollapsibleBlockComponent>

          {/* Seed Messages */}
          <CollapsibleBlockComponent
            icon={<MessageSquare size={14} />}
            label="Prefilled Messages"
            badge={
              seedMessages.length > 0 ? String(seedMessages.length) : undefined
            }
            open={seedsExpanded}
            onToggle={setSeedsExpanded}
            className={styles['collapsible-section']}
          >
            <div className={styles['seed-messages']}>
              {seedMessages.map((message: Message, i: number) => (
                <div key={i} className={styles['seed-message']}>
                  <div className={styles['seed-message-header']}>
                    <button
                      className={`${styles['role-toggle']} ${styles[`role-${message.role}`] || ""}`}
                      onClick={() =>
                        updateSeedMessage(
                          i,
                          "role",
                          message.role === "user" ? "assistant" : "user",
                        )
                      }
                      title="Toggle role"
                    >
                      {message.role === "user" ? (
                        <User size={12} />
                      ) : (
                        <Bot size={12} />
                      )}
                      {message.role}
                    </button>
                    <IconButtonComponent
                      icon={<Trash2 size={12} />}
                      onClick={() => removeSeedMessage(i)}
                      tooltip="Remove message"
                      variant="destructive"
                      className={styles['remove-seed-button']}
                    />
                  </div>
                  <TextAreaComponent
                    className={styles['seed-textarea']}
                    value={message.content}
                    onChange={(
                      e: React.ChangeEvent<
                        | HTMLInputElement
                        | HTMLTextAreaElement
                        | HTMLSelectElement
                      >,
                    ) => updateSeedMessage(i, "content", e.target.value)}
                    placeholder={`${message.role === "user" ? "User" : "Assistant"} message...`}
                    minRows={2}
                    maxRows={6}
                  />
                </div>
              ))}
              <div className={styles['add-seed-layout-row']}>
                <ButtonComponent
                  variant="disabled"
                  icon={Plus}
                  onClick={() => addSeedMessage("user")}
                  className={styles['add-seed-button']}
                >
                  User
                </ButtonComponent>
                <ButtonComponent
                  variant="disabled"
                  icon={Plus}
                  onClick={() => addSeedMessage("assistant")}
                  className={styles['add-seed-button']}
                >
                  Assistant
                </ButtonComponent>
              </div>
            </div>
          </CollapsibleBlockComponent>

          {/* Generated Preview — live message bubbles */}
          {(generatedMessages.length > 0 || isGenerating) && (
            <div className={styles['generated-section']}>
              <div className={styles['generated-header']}>
                <FlaskConical size={14} />
                <span>Generated Conversation</span>
                {generatedMessages.length > 0 && (
                  <BadgeComponent variant="accent" mini>
                    {generatedMessages.length} messages
                  </BadgeComponent>
                )}
                {conversationId && !isGenerating && (
                  <a
                    href={`/admin/chat/${conversationId}`}
                    className={styles['conversation-link']}
                    title="View persisted conversation"
                  >
                    View
                  </a>
                )}
                {isGenerating && (
                  <BadgeComponent
                    variant="success"
                    className={styles['streaming-badge']}
                  >
                    <span className={styles['streaming-dot']} />
                    Streaming
                  </BadgeComponent>
                )}
              </div>

              <MessageList
                messages={[
                  ...(systemPrompt.trim()
                    ? [
                        {
                          role: MESSAGE_ROLES.SYSTEM,
                          content: systemPrompt.trim(),
                        },
                      ]
                    : []),
                  ...generatedMessages,
                ]}
                isGenerating={isGenerating}
                onDelete={(index: number) => {
                  const offset = systemPrompt.trim() ? 1 : 0;
                  if (index >= offset) removeGeneratedMessage(index - offset);
                }}
                onEdit={(index: number, content: string) => {
                  const offset = systemPrompt.trim() ? 1 : 0;
                  if (index >= offset)
                    updateGeneratedMessage(index - offset, content);
                }}
                readOnly={false}
              />

              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Empty state */}
          {generatedMessages.length === 0 && !isGenerating && (
            <div className={styles['empty-center']}>
              <EmptyStateComponent
                icon={<FlaskConical size={40} />}
                title="SFT Data Synthesis"
                subtitle="Configure your system prompt and user persona, optionally prefill messages, then generate synthetic conversations via real turn-by-turn model distillation."
              />
            </div>
          )}
        </div>
      </ThreePanelLayout>
    </main>
  );
}
