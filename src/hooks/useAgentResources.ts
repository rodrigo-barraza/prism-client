"use client";

/**
 * An agent's editable resources, as the chat's side panels list them:
 * skills (by project), rules (the composer's `/` commands), lifecycle hooks
 * and the project instructions (PRISM.md). The admin viewer sets skills and
 * rules itself, for the conversation it shows.
 */

import { useCallback, useEffect, useState } from "react";
import PrismService from "../services/PrismService";
import type { Hook, ProjectInstructions, Rule, Skill } from "../types/types";

export default function useAgentResources({
  isAdmin,
  agentId,
  agentProject,
}: {
  isAdmin: boolean;
  agentId: string;
  agentProject: string | undefined;
}) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [projectInstructions, setProjectInstructions] = useState<ProjectInstructions | null>(null);

  // Load skills
  const loadSkills = useCallback(async () => {
    try {
      const skills = await PrismService.getSkills(agentProject);
      setSkills(skills);
    } catch (error: unknown) {
      console.error("Failed to load skills:", error);
    }
  }, [agentProject]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
    if (!isAdmin) loadSkills();
  }, [loadSkills, isAdmin]);

  // Load rules (per-agent slash commands)
  const loadRules = useCallback(async () => {
    try {
      const agentRules = await PrismService.getRules(agentId);
      setRules(agentRules);
    } catch (error: unknown) {
      console.error("Failed to load rules:", error);
    }
  }, [agentId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
    if (!isAdmin) loadRules();
  }, [loadRules, isAdmin]);

  // Load hooks (per-agent lifecycle handlers)
  const loadHooks = useCallback(async () => {
    try {
      const agentHooks = await PrismService.getHooks(agentId);
      setHooks(agentHooks || []);
    } catch (error: unknown) {
      console.error("Failed to load hooks:", error);
    }
  }, [agentId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
    if (!isAdmin) loadHooks();
  }, [loadHooks, isAdmin]);

  // Load project instructions (PRISM.md — the agent can rewrite this itself)
  const loadProjectInstructions = useCallback(async () => {
    try {
      const instructions = await PrismService.getProjectInstructions(agentId);
      setProjectInstructions(instructions);
    } catch (error: unknown) {
      console.error("Failed to load project instructions:", error);
    }
  }, [agentId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
    if (!isAdmin) loadProjectInstructions();
  }, [loadProjectInstructions, isAdmin]);

  return {
    skills,
    setSkills,
    loadSkills,
    rules,
    setRules,
    loadRules,
    hooks,
    loadHooks,
    projectInstructions,
    loadProjectInstructions,
  };
}

export type AgentResources = ReturnType<typeof useAgentResources>;
