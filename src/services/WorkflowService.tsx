"use client";

import PrismService from "./PrismService";

const WorkflowService = {
  /**
   * Get all saved workflows (metadata only).

   */
  async getWorkflows() {
    try {
      return await PrismService.getWorkflows();
    } catch {
      return [];
    }
  },

  /**
   * Get a single workflow by ID (full document).


   */
  async getWorkflow(id: any) {
    try {
      return await PrismService.getWorkflow(id);
    } catch {
      return null;
    }
  },

  /**
   * Save or update a workflow.

   * @returns {Promise<object>} The saved workflow with id
   */
  async saveWorkflow(workflow: any) {
    if (workflow.id) {
      // Update existing
      const { id, ...data } = workflow;
      await PrismService.updateWorkflow(id, data);
      return workflow;
    }
    // Create new
    const result = await PrismService.saveWorkflow(workflow);
    return { ...workflow, id: result.id };
  },

  /**
   * Delete a workflow by ID.

   */
  async deleteWorkflow(id: any) {
    await PrismService.deleteWorkflow(id);
  },
};

export default WorkflowService;
