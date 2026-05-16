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
import PrismService from "../services/PrismService.js";
import NavigationSidebarComponent from "./NavigationSidebarComponent.js";
import ThreePanelLayout from "./ThreePanelLayoutComponent.js";
import SettingsPanel from "./SettingsPanelComponent.js";
import ModelPickerPopoverComponent from "./ModelPickerPopoverComponent.js";
import { BadgeComponent, ButtonComponent, CollapsibleBlockComponent, CopyButtonComponent, EmptyStateComponent, IconButtonComponent, SelectComponent, TabBarComponent, TextAreaComponent } from "@rodrigo-barraza/components-library";

import PromptSectionComponent from "./PromptSectionComponent.js";

import MessageList from "./MessageListComponent.js";

import JsonViewerComponent from "./JsonViewerComponent.js";
import SynthesisHistoryPanel from "./SynthesisHistoryPanelComponent.js";
import { SETTINGS_DEFAULTS, SK_MODEL_MEMORY_SYNTHESIS } from "../constants.js";
import { generateUUID } from "../utils/utilities.js";
import styles from "./SynthesisComponent.module.css";
import useModelMemory from "../hooks/useModelMemory.js";

const DEFAULT_TURNS = 4;
const MIN_TURNS = 1;
const MAX_TURNS = 500;

const SAMPLE_SEEDS = [
  {
    label: "Chatbot with personality",
    system: "Bunny is a chatbot that stutters, and acts timid and unsure of its answers.",
    messages: [
      { role: "user", content: "When was the Library of Alexandria burned down?" },
      { role: "assistant", content: "Umm, I-I think that was in 48 BC, b-but I'm not sure, I'm sorry." },
    ],
    category: "Chat",
  },
  {
    label: "Coding assistant",
    system: "You are a senior software engineer who explains concepts clearly and provides production-quality code.",
    messages: [
      { role: "user", content: "How do I implement a debounce function in JavaScript?" },
    ],
    category: "Coding",
  },
  {
    label: "Creative writing",
    system: "You are a creative writing assistant with a poetic, evocative style. You help users craft vivid prose and poetry.",
    messages: [
      { role: "user", content: "Write a haiku about the first rain of spring." },
      { role: "assistant", content: "Petrichor rising,\nearth exhales its longest sigh—\nblossoms drink the sky." },
      { role: "user", content: "Now turn that into a short paragraph of prose." },
    ],
    category: "Creative Writing",
  },
  {
    label: "Brainstorming",
    system: "You are an enthusiastic brainstorming partner. You generate creative, diverse ideas and build on the user's suggestions.",
    messages: [
      { role: "user", content: "I need ideas for a mobile app that helps people learn languages through music." },
    ],
    category: "Brainstorm",
  },
  {
    label: "Roleplay - medieval guide",
    system: "You are a medieval town guide named Aldric. You speak in an old English dialect and are eager to show travelers around your village.",
    messages: [
      { role: "user", content: "What can I do in this town?" },
      { role: "assistant", content: "Ah, a weary traveler! Welcome, welcome to Thornhollow! Pray, follow me — I shall show thee the finest tavern this side of the King's Road, and mayhaps the blacksmith if thou needst thy blade sharpened." },
      { role: "user", content: "Take me to the tavern." },
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
  const [config, setConfig] = useState<any>(null);
  const [settings, setSettings] = useState<any>({
    ...SETTINGS_DEFAULTS,
    maxTokens: 4096,
  });
  const [leftTab, setLeftTab] = useState<any>("config"); // "config" | "output"

  // -- Model memory (persist last-used model per page) ----------
  const { saveModel, restoreModel } = useModelMemory(SK_MODEL_MEMORY_SYNTHESIS);

  // -- Synthesis state -------------------------------------------
  const [systemPrompt, setSystemPrompt] = useState<any>("");

  const [userPersona, setUserPersona] = useState<any>("");
  const [useUserSimModel, setUseUserSimModel] = useState<any>(true);
  const [userSimSettings, setUserSimSettings] = useState<any>({
    provider: "",
    model: "",
    temperature: 0.9,
  });
  const [targetTurns, setTargetTurns] = useState<any>(DEFAULT_TURNS);
  const [category, setCategory] = useState<any>("Chat");
  const [seedMessages, setSeedMessages] = useState<any>([]);
  const [generatedMessages, setGeneratedMessages] = useState<any>([]);
  const [isGenerating, setIsGenerating] = useState<any>(false);
  const [generationProgress, setGenerationProgress] = useState<any>("");
  const [seedsExpanded, setSeedsExpanded] = useState<any>(true);
  const [templateExpanded, setTemplateExpanded] = useState<any>(false);

  const abortRef = useRef<any>(null);
  const abortedRef = useRef<any>(false);
  const messagesEndRef = useRef<any>(null);
  const [conversationId, setConversationId] = useState<any>(null);

  // -- History state ---------------------------------------------
  const [synthesisConversations, setSynthesisConversations] = useState<any>([]);
  const [activeHistoryId, setActiveHistoryId] = useState<any>(null);
  const [favoriteKeys, setFavoriteKeys] = useState<any>([]);

  // -- Load synthesis history -------------------------------------
  const loadSynthesisHistory = useCallback(async () => {
    try {
      const runs = await PrismService.getSynthesisRuns();
      setSynthesisConversations(runs);
    } catch (error) {
      // @ts-ignore
      console.error("Failed to load synthesis history:", err);
    }
  }, []);

  // -- Load config -----------------------------------------------
  useEffect(() => {
    PrismService.getConfigWithLocalModels({
      onConfig: (cfg: any) => {
        setConfig(cfg);
        restoreModel(cfg, setSettings, {
          // @ts-ignore
          fallback: (config: any) => {
            // Auto-select first text-to-text provider/model if none set
            const textModels = config?.textToText?.models || {};
            const firstProvider = Object.keys(textModels)[0];
            if (firstProvider && textModels[firstProvider]?.length > 0) {
              setSettings((s: any) => ({
                ...s,
                provider: s.provider || firstProvider,
                model: s.model || textModels[firstProvider][0].name,
              }));
            }
          },
        });
      },
      onLocalMerge: (merged: any) => {
        setConfig(merged);
        restoreModel(merged, setSettings);
      },
    }).catch(console.error);
    loadSynthesisHistory();

    // Load favorites
    PrismService.getFavorites("model")
      .then((favs) => setFavoriteKeys(favs.map((f: any) => f.key)))
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // -- Favorites -------------------------------------------------
  const handleToggleFavorite = useCallback(async (key: any) => {
    if (favoriteKeys.includes(key)) {
      setFavoriteKeys((prev: any) => prev.filter((k: any) => k !== key));
      PrismService.removeFavorite("model", key).catch(() => {});
    } else {
      setFavoriteKeys((prev: any) => [...prev, key]);
      const [provider, ...rest] = key.split(":");
      PrismService.addFavorite("model", key, {
        provider,
        name: rest.join(":"),
      }).catch(() => {});
    }
  }, [favoriteKeys]);

  // -- Filtered config: text-to-text models only -----------------
  const filteredConfig = useMemo<any>(() => {
    if (!config) return null;
    return {
      ...config,
      textToImage: { models: {} },
      textToSpeech: { models: {}, voices: {}, defaultVoices: {} },
      audioToText: { models: {} },
    };
  }, [config]);

  // -- Model selection handler -----------------------------------
  const handleSelectModel = useCallback((provider: any, model: any) => {
    setSettings((s: any) => ({ ...s, provider, model }));
    saveModel(provider, model);
  }, [saveModel]);

  const handleSelectUserSimModel = useCallback((provider: any, model: any) => {
    setUserSimSettings((s: any) => ({ ...s, provider, model }));
  }, []);

  // -- Compute final messages array (SFT format) -----------------
  const sftOutput = useMemo<any>(() => {
    const msgs = [];
    if (systemPrompt.trim()) {
      msgs.push({ role: "system", content: systemPrompt.trim() });
    }
    // Filter out any internal _streaming flag
    for (const m of generatedMessages) {
      msgs.push({ role: m.role, content: m.content });
    }
    return msgs;
  }, [systemPrompt, generatedMessages]);

  const sftData = useMemo<any>(() => ({
    prompt: systemPrompt.trim(),
    prompt_id: generateUUID().replace(/-/g, ""),
    messages: sftOutput,
    category,
  }), [sftOutput, category, systemPrompt]);

  const sftJsonString = useMemo<any>(() => JSON.stringify(sftData, null, 2), [sftData]);

  // -- Auto-scroll messages --------------------------------------
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [generatedMessages, generationProgress]);

  // -- Seed message management -----------------------------------
  const addSeedMessage = useCallback((role = "user") => {
    setSeedMessages((prev: any) => [...prev, { role, content: "" }]);
  }, []);

  const updateSeedMessage = useCallback((index: any, field: any, value: any) => {
    setSeedMessages((prev: any) =>
      prev.map((m: any, i: any) => (i === index ? { ...m, [field]: value } : m)),
    );
  }, []);

  const removeSeedMessage = useCallback((index: any) => {
    setSeedMessages((prev: any) => prev.filter((_: any, i: any) => i !== index));
  }, []);

  const loadSeedTemplate = useCallback((seed: any) => {
    setSystemPrompt(seed.system);

    setSeedMessages(seed.messages.map((m: any) => ({ ...m })));
    setCategory(seed.category);
    setGeneratedMessages([]);
    setTemplateExpanded(false);
    setSeedsExpanded(true);
  }, []);

  // -- Generation logic (real back-and-forth /chat calls) ---------
  const handleGenerate = useCallback(async () => {
    if (!settings.provider || !settings.model) return;

    setIsGenerating(true);
    setGenerationProgress("");
    abortedRef.current = false;

    // Create a new conversation for this synthesis run
    const convId = generateUUID();
    setConversationId(convId);

    // Start with seed messages as the conversation so far
    const conversation = seedMessages
      .filter((m: any) => m.content.trim())
      .map((m: any) => ({ role: m.role, content: m.content }));

    setGeneratedMessages([...conversation]);

    // If we have seed messages, append them to the conversation first
    if (conversation.length > 0) {
      try {
        await PrismService.appendMessages(convId, conversation, undefined, {
          title: `Synthesis: ${systemPrompt.slice(0, 60)}`,
          systemPrompt: systemPrompt.trim(),
          synthetic: true,
          settings: {
            provider: settings.provider,
            model: settings.model,
            temperature: settings.temperature,
          },
        });
      } catch {
        // Non-critical — conversation just won't have seed messages persisted
      }
    }

    // Conversation metadata for Prism persistence — only used the FIRST
    // time we need to create the conversation record in the backend.
    const convMeta = {
      title: `Synthesis: ${systemPrompt.slice(0, 60)}`,
      systemPrompt: systemPrompt.trim(),
      synthetic: true,
      settings: {
        provider: settings.provider,
        model: settings.model,
        temperature: settings.temperature,
      },
    };

    // Track whether the conversation record has been created in the backend.
    // If seed messages were appended above, it's already created.
    let conversationCreated = conversation.length > 0;

    // targetTurns = total user/assistant pairs; each turn = 2 messages
    const totalMessages = targetTurns * 2;
    const remaining = totalMessages - conversation.length;

    // Figure out what role the next message should be
    let nextRole =
      conversation.length === 0
        ? "user"
        : conversation[conversation.length - 1].role === "user"
          ? "assistant"
          : "user";

    try {
      for (let i = 0; i < remaining; i++) {
        if (abortedRef.current) break;

        if (nextRole === "assistant") {
          // --- ASSISTANT TURN: genuine model response -----------
          const turnMeta = conversationCreated ? undefined : convMeta;
          let turnThinking = "";

          const assistantContent = await streamTurn(
            settings,
            systemPrompt.trim(),
            conversation,
            (partial: any) => {
              setGeneratedMessages([
                ...conversation,
                { role: "assistant", content: partial, thinking: turnThinking || undefined, _streaming: true },
              ]);
              setGenerationProgress(partial);
            },
            abortRef,
            convId,
            turnMeta,
            {
              // @ts-ignore
              onThinking: (chunk: any) => {
                turnThinking += chunk;
                setGeneratedMessages([
                  ...conversation,
                  { role: "assistant", content: "", thinking: turnThinking, _streaming: true },
                ]);
              },
            },
          );
          conversationCreated = true;

          if (abortedRef.current) break;

          conversation.push({ role: "assistant", content: assistantContent, thinking: turnThinking || undefined });
          setGeneratedMessages([...conversation]);
          setGenerationProgress("");
          nextRole = "user";
        } else {
          // --- USER TURN: simulated user message ---------------
          const userSystemPrompt = buildUserSimulationPrompt(userPersona);

          // Role-swap the conversation so the user-simulator model sees the
          // assistant's messages as "user" prompts and vice versa.
          // IMPORTANT: Many local models (Gemma, Llama, etc.) have strict
          // Jinja chat templates that require messages to alternate
          // user → assistant → user, with the first non-system message being
          // "user".  After role-swapping, the history may start with
          // "assistant" (when the real conversation started with a user msg).
          // We fix this by ensuring the first message is always role "user".
          let simulatorHistory;
          if (conversation.length > 0) {
            const swapped = conversation.map((m: any) => ({
              role: m.role === "user" ? "assistant" : "user",
              content: m.content,
            }));
            // If the swapped history starts with "assistant", prepend a
            // contextual user message so the template stays happy.
            if (swapped[0].role === "assistant") {
              swapped.unshift({
                role: "user",
                content: "Continue the conversation. Generate the next natural user message.",
              });
            }
            simulatorHistory = swapped;
          } else {
            simulatorHistory = [{ role: "user", content: "Start the conversation. Send the first message as the user." }];
          }

          // Use separate model for user simulation when enabled
          const userTurnSettings = useUserSimModel && userSimSettings.provider && userSimSettings.model
            ? { ...settings, provider: userSimSettings.provider, model: userSimSettings.model, temperature: userSimSettings.temperature }
            : settings;

          const userContent = await streamTurn(
            userTurnSettings,
            userSystemPrompt,
            simulatorHistory,
            (partial: any) => {
              setGeneratedMessages([
                ...conversation,
                { role: "user", content: partial, _streaming: true },
              ]);
              setGenerationProgress(partial);
            },
            abortRef,
            undefined,
            undefined,
            { skipConversation: true },
          );

          if (abortedRef.current) break;

          // Append the generated user message to the conversation in Prism
          const userMsg = { role: "user", content: userContent };
          conversation.push(userMsg);
          try {
            // Pass meta on the first call to create the conversation record
            const appendMeta = conversationCreated ? undefined : convMeta;
            await PrismService.appendMessages(convId, [userMsg], undefined, appendMeta);
            conversationCreated = true;
          } catch {
            // Non-critical
          }
          setGeneratedMessages([...conversation]);
          setGenerationProgress("");
          nextRole = "assistant";
        }
      }

      // Ensure conversation ends with assistant
      if (
        !abortedRef.current &&
        conversation.length > 0 &&
        conversation[conversation.length - 1].role !== "assistant"
      ) {
        let finalThinking = "";
        const assistantContent = await streamTurn(
          settings,
          systemPrompt.trim(),
          conversation,
          (partial: any) => {
            setGeneratedMessages([
              ...conversation,
              { role: "assistant", content: partial, thinking: finalThinking || undefined, _streaming: true },
            ]);
            setGenerationProgress(partial);
          },
          abortRef,
          convId,
          undefined,
          {
            // @ts-ignore
            onThinking: (chunk: any) => {
              finalThinking += chunk;
              setGeneratedMessages([
                ...conversation,
                { role: "assistant", content: "", thinking: finalThinking, _streaming: true },
              ]);
            },
          },
        );

        if (!abortedRef.current) {
          conversation.push({ role: "assistant", content: assistantContent, thinking: finalThinking || undefined });
          setGeneratedMessages([...conversation]);
        }
      }

      if (!abortedRef.current) {
        setLeftTab("output");

        // Save the synthesis run to the dedicated collection
        const synthesisRunId = generateUUID();
        try {
          await PrismService.createSynthesisRun({
            id: synthesisRunId,
            title: `Synthesis: ${systemPrompt.slice(0, 60)}`,
            systemPrompt,

            userPersona,
            category,
            targetTurns,
            seedMessages: seedMessages.filter((m: any) => m.content.trim()),
            settings: {
              provider: settings.provider,
              model: settings.model,
              temperature: settings.temperature,
            },
            conversationId: convId,
          });
          setActiveHistoryId(synthesisRunId);
        } catch (error) {
          // @ts-ignore
          console.error("Failed to save synthesis run:", err);
        }

        loadSynthesisHistory();
      }
    } catch (error) {
      // @ts-ignore
      if (error.name !== "AbortError" && !abortedRef.current) {
        setGeneratedMessages((prev: any) => [
          ...prev.filter((m: any) => !m._streaming),
          {
            role: "assistant",
            // @ts-ignore
            content: `⚠️ Generation error: ${error.message}`,
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
    setGeneratedMessages((prev: any) => prev.filter((m: any) => !m._streaming));
  }, []);

  const handleReset = useCallback(() => {
    setSeedMessages([]);
    setGeneratedMessages([]);
    setSystemPrompt("");

    setUserPersona("");
    setUseUserSimModel(true);
    setUserSimSettings({ provider: "", model: "", temperature: 0.9 });
    setTargetTurns(DEFAULT_TURNS);
    setCategory("Chat");
    setGenerationProgress("");
    setConversationId(null);
    setActiveHistoryId(null);
    setLeftTab("config");
  }, []);

  // -- History selection -----------------------------------------
  const handleSelectHistory = useCallback(async (run: any) => {
    try {
      // Restore the synthesis config
      if (run.systemPrompt) setSystemPrompt(run.systemPrompt);

      if (run.userPersona !== undefined) setUserPersona(run.userPersona);
      if (run.category) setCategory(run.category);
      if (run.targetTurns) setTargetTurns(run.targetTurns);
      if (run.seedMessages) setSeedMessages(run.seedMessages);
      if (run.settings) {
        setSettings((s: any) => ({
          ...s,
          provider: run.settings.provider || s.provider,
          model: run.settings.model || s.model,
          temperature: run.settings.temperature ?? s.temperature,
        }));
      }

      setActiveHistoryId(run.id);
      setConversationId(run.conversationId || null);

      // Load the generated conversation if it exists
      if (run.conversationId) {
        try {
          const full = await PrismService.getConversation(run.conversationId);
          const msgs = (full.messages || []).filter((m: any) => m.role !== "system");
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
    } catch (error) {
      // @ts-ignore
      console.error("Failed to load synthesis run:", err);
    }
  }, []);

  const handleDeleteHistory = useCallback(async (id: any) => {
    try {
      await PrismService.deleteSynthesisRun(id);
      setSynthesisConversations((prev: any) => prev.filter((c: any) => c.id !== id));
      // If the deleted run is currently active, clear the view
      setActiveHistoryId((prev: any) => {
        if (prev === id) {
          setGeneratedMessages([]);
          setConversationId(null);
          setLeftTab("config");
          return null;
        }
        return prev;
      });
    } catch (error) {
      // @ts-ignore
      console.error("Failed to delete synthesis run:", err);
    }
  }, []);

  const handleDownload = useCallback(() => {
    const blob = new Blob([sftJsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sft-conversation-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [sftJsonString]);

  // -- Edit generated message ------------------------------------
  const updateGeneratedMessage = useCallback((index: any, content: any) => {
    setGeneratedMessages((prev: any) =>
      prev.map((m: any, i: any) => (i === index ? { ...m, content } : m)),
    );
  }, []);

  const removeGeneratedMessage = useCallback((index: any) => {
    setGeneratedMessages((prev: any) => prev.filter((_: any, i: any) => i !== index));
  }, []);

  // -- Render ----------------------------------------------------

  const leftPanel = (
    <>
      <TabBarComponent
        tabs={[
          { key: "config", label: "Configure" },
          {
            key: "output",
            label: "Output",
            badge: generatedMessages.length > 0 ? generatedMessages.length : undefined,
          },
        ]}
        activeTab={leftTab}
        onChange={setLeftTab}
      />

      {leftTab === "config" && (
        <div className={styles.configPanel}>
          {/* Model selection */}
          <SettingsPanel
            config={filteredConfig}
            settings={settings}
            onChange={(updates: any) => setSettings((s: any) => ({ ...s, ...updates }))}
            // @ts-ignore
            hasAssistantImages={false}
            hideProviderModel={false}
          />

        </div>
      )}

      {leftTab === "output" && (
        <div className={styles.outputPanel}>
          {generatedMessages.length > 0 ? (
            <>
              <div className={styles.outputActions}>
                <CopyButtonComponent
                  text={sftJsonString}
                  showLabel
                  tooltip="Copy SFT JSON"
                  className={styles.outputActionBtn}
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
              {/* @ts-ignore */}
              <JsonViewerComponent
                data={sftData}
                label="SFT Output"
              />
            </>
          ) : (
            <div className={styles.outputEmpty}>
              <FlaskConical size={24} />
              <p>Generate a conversation to see the SFT output here.</p>
            </div>
          )}
        </div>
      )}
    </>
  );

  return (
    <main className={styles.appContainer}>
      <ThreePanelLayout
        // @ts-ignore
        leftTitle={null}
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
        headerTitle="Synthesis"
        // @ts-ignore
        navSidebar={
          // @ts-ignore
          <NavigationSidebarComponent
            mode="user"
            isGenerating={isGenerating}
          />
        }
        // @ts-ignore
        headerCenter={
          <div className={styles.headerCenterGroup}>
            {/* @ts-ignore */}
            <ModelPickerPopoverComponent
              config={filteredConfig}
              settings={settings}
              onSelectModel={handleSelectModel}
              favorites={favoriteKeys}
              onToggleFavorite={handleToggleFavorite}
            />
            <span className={styles.userSimLabel}>
              <User size={12} />
            </span>
            {/* @ts-ignore */}
            <ModelPickerPopoverComponent
              config={filteredConfig}
              settings={userSimSettings}
              onSelectModel={handleSelectUserSimModel}
              favorites={favoriteKeys}
              onToggleFavorite={handleToggleFavorite}
            />
          </div>
        }
        // @ts-ignore
        headerControls={
          <div className={styles.headerActions}>
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
        <div className={styles.workspace}>
          {/* Conversation Length & Category bar */}
          <div className={styles.configBar}>
            <div className={styles.configBarItem}>
              <div className={styles.configBarLabel}>
                <MessageSquare size={13} />
                Length
              </div>
              <div className={styles.configBarControl}>
                <input
                  type="number"
                  className={styles.turnsInput}
                  value={targetTurns}
                  min={MIN_TURNS}
                  max={MAX_TURNS}
                  step={1}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === "") { setTargetTurns(""); return; }
                    const v = parseInt(raw, 10);
                    if (!isNaN(v)) setTargetTurns(v);
                  }}
                  onBlur={() => {
                    const clamped = Math.max(MIN_TURNS, Math.min(MAX_TURNS, Number(targetTurns) || DEFAULT_TURNS));
                    setTargetTurns(clamped);
                  }}
                />
                <span className={styles.turnsValue}>turns</span>
              </div>
            </div>
            <div className={styles.configBarItem}>
              <div className={styles.configBarLabel}>
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
          <div className={styles.promptRow}>
            {/* @ts-ignore */}
            <PromptSectionComponent
              icon={<Settings2 size={14} />}
              label="System Prompt"
              value={systemPrompt}
              onChange={setSystemPrompt}
              placeholder="Core instructions for the assistant model..."
              rows={3}
            />
            {/* @ts-ignore */}
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
            className={styles.collapsibleSection}
          >
            <div className={styles.templateGrid}>
              {SAMPLE_SEEDS.map((seed) => (
                <button
                  key={seed.label}
                  className={styles.templateCard}
                  onClick={() => loadSeedTemplate(seed)}
                >
                  <span className={styles.templateLabel}>{seed.label}</span>
                  <span className={styles.templateCategory}>
                    {seed.category}
                  </span>
                  <span className={styles.templateMsgCount}>
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
            badge={seedMessages.length > 0 ? String(seedMessages.length) : undefined}
            open={seedsExpanded}
            onToggle={setSeedsExpanded}
            className={styles.collapsibleSection}
          >
            <div className={styles.seedMessages}>
              {seedMessages.map((msg: any, i: any) => (
                <div key={i} className={styles.seedMessage}>
                  <div className={styles.seedMessageHeader}>
                    <button
                      className={`${styles.roleToggle} ${styles[`role_${msg.role}`]}`}
                      onClick={() =>
                        updateSeedMessage(
                          i,
                          "role",
                          msg.role === "user" ? "assistant" : "user",
                        )
                      }
                      title="Toggle role"
                    >
                      {msg.role === "user" ? (
                        <User size={12} />
                      ) : (
                        <Bot size={12} />
                      )}
                      {msg.role}
                    </button>
                    <IconButtonComponent
                      icon={<Trash2 size={12} />}
                      onClick={() => removeSeedMessage(i)}
                      tooltip="Remove message"
                      variant="destructive"
                      className={styles.removeSeedBtn}
                    />
                  </div>
                  <TextAreaComponent
                    className={styles.seedTextarea}
                    value={msg.content}
                    onChange={(e: any) =>
                      updateSeedMessage(i, "content", e.target.value)
                    }
                    placeholder={`${msg.role === "user" ? "User" : "Assistant"} message...`}
                    minRows={2}
                    maxRows={6}
                  />
                </div>
              ))}
              <div className={styles.addSeedRow}>
                <ButtonComponent
                  variant="disabled"
                  icon={Plus}
                  onClick={() => addSeedMessage("user")}
                  className={styles.addSeedBtn}
                >
                  User
                </ButtonComponent>
                <ButtonComponent
                  variant="disabled"
                  icon={Plus}
                  onClick={() => addSeedMessage("assistant")}
                  className={styles.addSeedBtn}
                >
                  Assistant
                </ButtonComponent>
              </div>
            </div>
          </CollapsibleBlockComponent>

          {/* Generated Preview — live message bubbles */}
          {(generatedMessages.length > 0 || isGenerating) && (
            <div className={styles.generatedSection}>
              <div className={styles.generatedHeader}>
                <FlaskConical size={14} />
                <span>Generated Conversation</span>
                {generatedMessages.length > 0 && (
                  <BadgeComponent variant="accent" mini>
                    {generatedMessages.length} messages
                  </BadgeComponent>
                )}
                {conversationId && !isGenerating && (
                  <a
                    href={`/admin/conversations/${conversationId}`}
                    className={styles.convLink}
                    title="View persisted conversation"
                  >
                    View
                  </a>
                )}
                {isGenerating && (
                  <BadgeComponent variant="success" className={styles.streamingBadge}>
                    <span className={styles.streamingDot} />
                    Streaming
                  </BadgeComponent>
                )}
              </div>

              <MessageList
                // @ts-ignore
                messages={[
                  ...(systemPrompt.trim()
                    ? [{ role: "system", content: systemPrompt.trim() }]
                    : []),
                  ...generatedMessages,
                ]}
                isGenerating={isGenerating}
                onDelete={(index: any) => {
                  const offset = systemPrompt.trim() ? 1 : 0;
                  if (index >= offset) removeGeneratedMessage(index - offset);
                }}
                onEdit={(index: any, content: any) => {
                  const offset = systemPrompt.trim() ? 1 : 0;
                  if (index >= offset) updateGeneratedMessage(index - offset, content);
                }}
                readOnly={false}
              />

              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Empty state */}
          {generatedMessages.length === 0 && !isGenerating && (
            <div className={styles.emptyCenter}>
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

// -- Helpers -----------------------------------------------------

/**
 * Stream a single chat turn and return the collected text.
 * Each turn is a real /chat call — the model genuinely responds to the context.
 * When conversationId is provided, the messages are persisted to that conversation.
 */
// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
function streamTurn(settings, turnSystemPrompt, history, onPartial, abortRef, conversationId, conversationMeta, { skipConversation = false, onThinking } = {}) {
  return new Promise((resolve, reject) => {
    let collected = "";

    const payload = {
      provider: settings.provider,
      model: settings.model,
      messages: [
        { role: "system", content: turnSystemPrompt },
        ...history,
      ],
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
    };

    // Thinking / reasoning settings — respect the user's toggle
    const thinkingOn = settings.thinkingEnabled ?? (settings.provider === "lm-studio");
    if (thinkingOn) {
      // @ts-ignore
      payload.thinkingEnabled = true;
      // @ts-ignore
      if (settings.reasoningEffort) payload.reasoningEffort = settings.reasoningEffort;
      // @ts-ignore
      if (settings.thinkingLevel) payload.thinkingLevel = settings.thinkingLevel;
      // @ts-ignore
      if (settings.thinkingBudget) payload.thinkingBudget = settings.thinkingBudget;
    } else {
      // @ts-ignore
      payload.thinkingEnabled = false;
    }

    // Skip conversation persistence entirely (used for user-simulation turns)
    if (skipConversation) {
      // @ts-ignore
      payload.skipConversation = true;
    } else if (conversationId) {
      // @ts-ignore
      payload.conversationId = conversationId;
      // @ts-ignore
      if (conversationMeta) payload.conversationMeta = conversationMeta;
    }

    const cancel = PrismService.streamText(
      payload,
      {
        onChunk: (content: any) => {
          collected += content;
          onPartial(collected);
        },
        onThinking: onThinking || undefined,
        onDone: () => resolve(collected),
        // @ts-ignore: any
        onError: (err) => reject(error),
      },
    );

    abortRef.current = cancel;
  });
}

/**
 * Build the system prompt for the user-simulator model call.
 * Instructs the model to role-play as the user persona and
 * generate a single natural follow-up user message.
 */
function buildUserSimulationPrompt(userPersona: any) {
  let prompt = `You are simulating a human user in a conversation with an AI assistant. Your job is to generate the NEXT single message that this user would naturally say.

`;

  if (userPersona.trim()) {
    prompt += `## Your Personality
"""
${userPersona}
"""

`;
  } else {
    prompt += `## Your Personality
You are a casual, curious human chatting naturally. Ask follow-up questions, share reactions, and keep the conversation flowing organically.

`;
  }

  prompt += `## Rules
- Generate ONLY the next user message — nothing else.
- Do NOT include quotes, labels, prefixes like "User:", or any meta-commentary.
- Be natural and conversational — react to what the assistant said, ask follow-ups, or steer the topic.
- Keep messages concise and human-like (1-3 sentences typically).
- Do NOT repeat or rephrase previous messages.`;

  return prompt;
}
