const fs = require('fs');

const fixTypes = (file, replacements) => {
  let content = fs.readFileSync(file, 'utf8');
  for (const [find, replace] of replacements) {
    content = content.replace(find, replace);
  }
  fs.writeFileSync(file, content);
  console.log(`Fixed ${file}`);
};

fixTypes('src/app/admin/conversations/page.tsx', [
  [/let pollInterval = null;/g, 'let pollInterval: any = null;']
]);

fixTypes('src/app/admin/page.tsx', [
  [/let pollInterval = null;/g, 'let pollInterval: any = null;'],
  [/let debounceTimer = null;/g, 'let debounceTimer: any = null;']
]);

fixTypes('src/app/admin/requests/page.tsx', [
  [/let pollInterval = null;/g, 'let pollInterval: any = null;'],
  [/let debounceTimer = null;/g, 'let debounceTimer: any = null;']
]);

fixTypes('src/app/admin/traces/page.tsx', [
  [/let pollInterval = null;/g, 'let pollInterval: any = null;'],
  [/let debounceTimer = null;/g, 'let debounceTimer: any = null;']
]);

fixTypes('src/components/AdminShellComponent.tsx', [
  [/let pollInterval = null;/g, 'let pollInterval: any = null;']
]);

fixTypes('src/components/BenchmarkSidebarComponent.tsx', [
  [/let interval = null;/g, 'let interval: any = null;']
]);

fixTypes('src/components/CustomToolsPanelComponent.tsx', [
  [/let params = \[\];/g, 'let params: any[] = [];']
]);

fixTypes('src/components/FileViewerPanelComponent.tsx', [
  [/let injected = \[\];/g, 'let injected: any[] = [];']
]);

fixTypes('src/components/ModelPickerPopoverComponent.tsx', [
  [/let ro = null;/g, 'let ro: any = null;']
]);

fixTypes('src/components/NavigationSidebarComponent.tsx', [
  [/let rafId = null;/g, 'let rafId: any = null;']
]);

fixTypes('src/components/RainbowCanvasComponent.tsx', [
  [/let ro = null;/g, 'let ro: any = null;']
]);
