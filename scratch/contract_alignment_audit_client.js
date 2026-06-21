import fs from 'fs';
import path from 'path';

const WORKSPACE_DIR = '/home/rodrigo/development/prism-client';
const TESTS_DIR = path.join(WORKSPACE_DIR, 'tests');

const productionTypes = [
  'ModelInstance', 'AgentInstance', 'ModelOptionWithProvider', 'ArenaScores', 'ModelOption', 'ModelDefaults',
  'ModelsMap', 'ModalityConfig', 'VoiceOption', 'TextToSpeechConfig', 'LocalProviderInfo', 'ParameterDescriptor',
  'PrismConfig', 'BackgroundUsage', 'GenerationSettings', 'SubAgentGenerationProgress', 'ConversationStats',
  'TokenUsage', 'ConversationMeta', 'Message', 'Conversation', 'ConversationListResponse', 'AgentConversation',
  'AgentConversationListResponse', 'SSEChunkEvent', 'SSEThinkingEvent', 'SSEImageEvent', 'SSEAudioEvent',
  'SSEToolCallEvent', 'SSEToolExecutionEvent', 'SSEToolOutputEvent', 'SSEApprovalRequiredEvent', 'SSEPlanProposalEvent',
  'SSEUserQuestionEvent', 'SSESubAgentStatusEvent', 'SSEUsageUpdateEvent', 'SSEDoneEvent', 'SSEErrorEvent',
  'SSEEvent', 'TransformedSSEData', 'SSEData', 'TransformedRequestItem', 'SSECallbacks', 'ContentSegment',
  'ToolCallEvent', 'WebSearchResult', 'FileAttachment', 'SerializedPolicy'
];

const productionConstants = {
  'lastProvider': 'SK_LAST_PROVIDER',
  'lastModel': 'SK_LAST_MODEL',
  'inferenceMode': 'SK_INFERENCE_MODE',
  'modelMemory:agent': 'SK_MODEL_MEMORY_AGENT',
  'modelMemory:agent:': 'SK_MODEL_MEMORY_AGENT_PREFIX',
  'modelMemory:synthesis': 'SK_MODEL_MEMORY_SYNTHESIS',
  'modelMemory:benchmarks': 'SK_MODEL_MEMORY_BENCHMARKS',
  'toolMemory:agent:': 'SK_TOOL_MEMORY_AGENT_PREFIX',
  'panel_left': 'LS_PANEL_LEFT',
  'panel_right': 'LS_PANEL_RIGHT',
  'panel_nav': 'LS_PANEL_NAV',
  'prism_system_instructions': 'LS_SYSTEM_INSTRUCTIONS',
  'workflow-inspector-width': 'LS_WORKFLOW_INSPECTOR_WIDTH',
  'workflow-expanded-nodes': 'LS_WORKFLOW_EXPANDED_NODES',
  'workflow-views': 'LS_WORKFLOW_VIEWS',
  'admin:projectFilter': 'LS_ADMIN_PROJECT_FILTER',
  'prism-date-range': 'LS_DATE_RANGE',
  'prism:chat-filters': 'LS_CHAT_FILTERS',
  'prism:admin-chat-filters': 'LS_ADMIN_CHAT_FILTERS',
  'prism:workspace': 'LS_WORKSPACE_ROOT',
  'prism:fileViewerWidth': 'LS_FILE_VIEWER_WIDTH',
  'prism:leftSidebarSplitRatio': 'LS_LEFT_SIDEBAR_SPLIT_RATIO',
  'prism:username': 'LS_USERNAME',
  'agent:criticGateEnabled': 'LS_CRITIC_GATE_ENABLED',
  'agent:autoApproveEnabled': 'LOCAL_STORAGE_AUTO_APPROVE_ENABLED',
  'agent:maxIterations': 'LS_AGENT_MAX_ITERATIONS',
  'agent:maxSubAgentIterations': 'LS_AGENT_MAX_SUB_AGENT_ITERATIONS',
  'agent:maxRecursionDepth': 'LS_AGENT_MAX_RECURSION_DEPTH',
  'cron-job-notifications-count': 'LS_CRON_JOB_NOTIFICATIONS_COUNT',
  'prism:activeAgent': 'LS_ACTIVE_AGENT',
  'lm-studio-load-config:': 'LS_LM_STUDIO_LOAD_CONFIG_PREFIX',
  'cron-job-scheduled': 'EV_CRON_JOB_SCHEDULED',
  'prism-settings-updated': 'EV_PRISM_SETTINGS_UPDATED',
  'panel:dismiss-sidebars': 'EV_PANEL_DISMISS_SIDEBARS',
  'sidebarTab:change': 'EV_SIDEBAR_TAB_CHANGE',
  'sidebarTabBottom:change': 'EV_SIDEBAR_TAB_BOTTOM_CHANGE',
  'viewMode:change': 'EV_VIEW_MODE_CHANGE',
  'user:typing': 'EV_USER_TYPING',
  'conversation:change': 'EV_CONVERSATION_CHANGE',
  'agent:switch': 'EV_AGENT_SWITCH',
  'model:change': 'EV_MODEL_CHANGE'
};

function walkDir(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.next') {
        walkDir(filePath, fileList);
      }
    } else if (file.endsWith('.test.ts') || file.endsWith('.spec.ts') || file.endsWith('.test.tsx') || file.endsWith('.spec.tsx')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const testFiles = walkDir(TESTS_DIR);
const report = [];

for (const file of testFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  const relativePath = path.relative(WORKSPACE_DIR, file);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    // 1. Check for Duplicated Types
    const interfaceMatch = line.match(/^\s*(?:export\s+)?interface\s+(\w+)/);
    const typeMatch = line.match(/^\s*(?:export\s+)?type\s+(\w+)\s*=/);
    
    if (interfaceMatch) {
      const typeName = interfaceMatch[1];
      if (productionTypes.includes(typeName)) {
        report.push({
          category: 'Duplicated Types & Interfaces (Phantom Contracts)',
          file: relativePath,
          lineStart: lineNumber,
          lineEnd: lineNumber + 5,
          severity: '🔴',
          description: `Test declares a local interface \`${typeName}\` which duplicates a production type definition.`,
          fix: `Import \`${typeName}\` from its canonical production path.`
        });
      }
    }

    if (typeMatch) {
      const typeName = typeMatch[1];
      if (productionTypes.includes(typeName)) {
        report.push({
          category: 'Duplicated Types & Interfaces (Phantom Contracts)',
          file: relativePath,
          lineStart: lineNumber,
          lineEnd: lineNumber,
          severity: '🔴',
          description: `Test declares a local type alias \`${typeName}\` which duplicates a production type.`,
          fix: `Import \`${typeName}\` from its canonical production path.`
        });
      }
    }

    // 2. Check for Hard-Coded Magic Strings
    for (const [literal, constantName] of Object.entries(productionConstants)) {
      const escapedLiteral = literal.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const literalRegex = new RegExp(`(['"\`])${escapedLiteral}\\1`);
      
      if (literalRegex.test(line)) {
        if (!line.includes('import ') && !line.includes('require(')) {
          report.push({
            category: 'Hard-Coded Magic Strings & Values',
            file: relativePath,
            lineStart: lineNumber,
            lineEnd: lineNumber,
            severity: '🟡',
            description: `Literal string \`"${literal}"\` duplicates the production constant \`${constantName}\`.`,
            fix: `Import and use \`${constantName}\` from \`src/constants.ts\`.`
          });
        }
      }
    }

    // 3. Reimplemented production logic
    if (line.includes('Replicates lines') || line.includes('Copied from') || line.includes('mimics production')) {
      report.push({
        category: 'Reimplemented Production Logic',
        file: relativePath,
        lineStart: lineNumber,
        lineEnd: lineNumber,
        severity: '🔴',
        description: `Comment indicates reimplemented production logic: "${line.trim()}"`,
        fix: `Import the helper function directly from production rather than replicating it.`
      });
    }

    // 4. Stale Mock Contracts
    if (line.includes('as any') || line.includes('as unknown')) {
      if (line.includes('req') || line.includes('res') || line.includes('payload') || line.includes('message') || line.includes('session')) {
        report.push({
          category: 'Stale Mock Contracts',
          file: relativePath,
          lineStart: lineNumber,
          lineEnd: lineNumber,
          severity: '🔵',
          description: `Object casted using \`as any\` / \`as unknown\` may bypass type-checking against production type: \`${line.trim()}\`.`,
          fix: `Ensure object is properly typed using production type and verify shape alignment.`
        });
      }
    }
  }
}

const scratchDir = path.join(WORKSPACE_DIR, 'scratch');
if (!fs.existsSync(scratchDir)) {
  fs.mkdirSync(scratchDir);
}
fs.writeFileSync(path.join(scratchDir, 'audit_compiled_report.json'), JSON.stringify(report, null, 2));
console.log(`Audit run complete. Found ${report.length} potential issues. Report saved to scratch/audit_compiled_report.json.`);
