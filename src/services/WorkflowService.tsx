"use client";

import PrismService from "./PrismService";
import type { Workflow } from "../types/types";

const WorkflowService = {
  /**
   * Get all saved workflows (metadata only).
   */
  async getWorkflows(): Promise<Workflow[]> {
    try {
      return await PrismService.getWorkflows();
    } catch {
      return [];
    }
  },

  /**
   * Get a single workflow by ID (full document).
   */
  async getWorkflow(id: string): Promise<Workflow | null> {
    try {
      return await PrismService.getWorkflow(id);
    } catch {
      return null;
    }
  },

  /**
   * Save or update a workflow.
   */
  async saveWorkflow(
    workflow: Workflow & { id?: string },
  ): Promise<Workflow & { id: string }> {
    if (workflow.id) {
      // Update existing
      const { id, ...data } = workflow;
      await PrismService.updateWorkflow(id, data);
      return workflow as Workflow & { id: string };
    }
    // Create new
    const result = await PrismService.saveWorkflow(workflow);
    return { ...workflow, id: result.id };
  },

  /**
   * Delete a workflow by ID.
   */
  async deleteWorkflow(id: string): Promise<void> {
    await PrismService.deleteWorkflow(id);
  },
};

export default WorkflowService;
