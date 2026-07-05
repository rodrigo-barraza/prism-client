import React from "react";
import { ToolResultViewProps, RendererProps } from "./types";
import { InputArgsToggle, OutputResultToggle, RawResultToggle } from "./SharedComponents";
import * as Renderers from "./renderers";

/**
 * Registry mapping tool names to their respective React renderer components.
 */
const TOOL_RESULT_RENDERER_REGISTRY: Record<
  string,
  { Renderer: React.ComponentType<RendererProps>; language?: string }
> = {
  // File operations
  read_file: { Renderer: Renderers.FileReadRenderer },
  write_file: { Renderer: Renderers.FileWriteRenderer },
  replace_in_file: { Renderer: Renderers.StrReplaceRenderer },
  patch_file: { Renderer: Renderers.FileWriteRenderer },
  read_multi_file: { Renderer: Renderers.GenericRenderer },
  get_file_info: { Renderer: Renderers.GenericRenderer },
  diff_files: { Renderer: Renderers.GitDiffRenderer },
  move_file: { Renderer: Renderers.FileMoveRenderer },
  delete_file: { Renderer: Renderers.FileDeleteRenderer },

  // Search
  search_file_contents: { Renderer: Renderers.GrepSearchRenderer },
  find_files: { Renderer: Renderers.GlobFilesRenderer },
  list_directory: { Renderer: Renderers.DirectoryListRenderer },

  // Web
  search_web: { Renderer: Renderers.WebSearchRenderer },
  read_web_page: { Renderer: Renderers.FetchUrlRenderer },

  // Execution
  execute_shell: { Renderer: Renderers.TerminalRenderer, language: "bash" },
  execute_python: { Renderer: Renderers.TerminalRenderer, language: "python" },
  execute_javascript: { Renderer: Renderers.TerminalRenderer, language: "javascript" },
  execute_command: { Renderer: Renderers.TerminalRenderer, language: "bash" },
  schedule: { Renderer: Renderers.ScheduleRenderer },

  // Git
  git_status: { Renderer: Renderers.GitStatusRenderer },
  git_diff: { Renderer: Renderers.GitDiffRenderer },
  git_log: { Renderer: Renderers.GitLogRenderer },

  // Project
  summarize_project: { Renderer: Renderers.GenericRenderer },

  // Browser
  control_browser: { Renderer: Renderers.BrowserActionRenderer },

  // Turtle Graphics
  draw_turtle_graphics: { Renderer: Renderers.TurtleDrawRenderer },
  create_vector_animation: { Renderer: Renderers.VectorAnimationRenderer },

  // 3D Tools
  create_3d_mesh: { Renderer: Renderers.ThreeMeshRenderer },
  create_3d_voxel: { Renderer: Renderers.ThreeVoxelRenderer },
  create_3d_model: { Renderer: Renderers.ThreeModelRenderer },
  create_3d_scene: { Renderer: Renderers.ThreeSceneRenderer },

  // Visual Compute Tools
  generate_qr_code: { Renderer: Renderers.QrCodeRenderer },
  render_latex: { Renderer: Renderers.LatexRenderer },
  generate_diagram: { Renderer: Renderers.DiagramRenderer },
  manipulate_image: { Renderer: Renderers.ImageManipulationRenderer },
  convert_video_to_gif: { Renderer: Renderers.VideoToGifRenderer },
  generate_map: { Renderer: Renderers.MapRenderer },
  generate_chart: { Renderer: Renderers.ChartRenderer },

  // Image to ASCII Art
  convert_image_to_ascii: { Renderer: Renderers.AsciiImageRenderer },

  // Emoji Kitchen
  get_emoji_combination: { Renderer: Renderers.EmojiCombinationRenderer },
  get_emoji_combinations: { Renderer: Renderers.EmojiCombinationsRenderer },

  // Audio Generation
  generate_audio: { Renderer: Renderers.AudioGeneratorRenderer },

  // Text-to-Speech
  synthesize_speech: { Renderer: Renderers.TextToSpeechRenderer },
  synthesize_speech_local: { Renderer: Renderers.TextToSpeechRenderer },

  // Coordinator
  create_subagent: { Renderer: Renderers.TeamCreateRenderer },
  create_subagents: { Renderer: Renderers.TeamCreateRenderer },
  send_subagent_message: { Renderer: Renderers.SendMessageRenderer },
  stop_subagent: { Renderer: Renderers.StopAgentRenderer },
};

/**
 * Resolves the appropriate result renderer for a given tool name.
 * Falls back to GenericRenderer if no match is found.
 */
export function resolveToolResultRenderer(toolName: string): {
  Renderer: React.ComponentType<RendererProps>;
  language?: string;
} {
  return (
    TOOL_RESULT_RENDERER_REGISTRY[toolName] || { Renderer: Renderers.GenericRenderer }
  );
}

/**
 * Main component for rendering tool call results.
 * Orchestrates the display of input arguments, the specific tool output renderer,
 * and the raw result toggle.
 */
export function ToolResultView({
  toolCall,
  streamingOutput,
  subAgentToolActivity,
  hideToggles = false,
  subAgentStartIndex,
}: ToolResultViewProps) {
  const { Renderer, language } = resolveToolResultRenderer(toolCall.name);

  return (
    <>
      {!hideToggles && <InputArgsToggle args={toolCall.args} />}
      <Renderer
        result={toolCall.result}
        args={toolCall.args}
        streamingOutput={streamingOutput}
        language={language}
        subAgentToolActivity={subAgentToolActivity}
        subAgentStartIndex={subAgentStartIndex}
      />
      {!hideToggles && <OutputResultToggle result={toolCall.result} />}
    </>
  );
}

// Re-export types for convenience
export * from "./types";
