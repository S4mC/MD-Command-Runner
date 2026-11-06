import {
  ExtensionContext,
  languages,
  commands,
  Disposable,
  workspace,
  window,
  TextEditorDecorationType,
  Range,
  TextEditor,
  QuickPickItem,
} from "vscode";
import { CodelensProvider } from "./CodelensProvider";
import { Terminal } from "./Terminal";

let disposables: Disposable[] = [];
let commandDecorationType: TextEditorDecorationType;
let refreshInterval: NodeJS.Timeout | undefined;
let codelensProviderInstance: CodelensProvider | undefined;

// Function to create decoration style based on configuration
function createDecorationType(): TextEditorDecorationType {
  const config = workspace.getConfiguration("command-runner");
  const decorationStyle = config.get<string>("decorationStyle", "background");
  const borderColor = config.get("decorationBorderColor", "#569cd6");
  const backgroundColor = config.get("decorationBackgroundColor", "rgba(86, 156, 214, 0.1)");

  const decorationType = window.createTextEditorDecorationType(
    decorationStyle === "outline"
      ? {
          borderWidth: "1px",
          borderStyle: "solid",
          borderColor: borderColor,
          backgroundColor: backgroundColor,
          borderRadius: "3px",
          isWholeLine: false,
        }
      : {
          backgroundColor: backgroundColor,
          isWholeLine: true,
        }
  );
  
  return decorationType;
}

// Track command execution history for hover info
interface CommandExecution {
  command: string;
  lastExecuted?: Date;
  executionCount: number;
}

const commandHistory: Map<string, CommandExecution> = new Map();

function trackCommandExecution(command: string) {
  const existing = commandHistory.get(command) || { command, executionCount: 0 };
  existing.lastExecuted = new Date();
  existing.executionCount++;
  commandHistory.set(command, existing);
}

// Function to update decorations in the active editor
function updateDecorations(editor: TextEditor | undefined) {
  if (!editor) {
    return;
  }

  const config = workspace.getConfiguration("command-runner");
  const enableDecorations = config.get("enableDecorations", true);
  const showHoverInfo = config.get("showHoverInfo", true);
  
  if (!enableDecorations) {
    editor.setDecorations(commandDecorationType, []);
    return;
  }

  const document = editor.document;
  const regex = /(?:^|\s)run\s+(?:([\w-]+))?(`{1,3})([\s\S]*?)\2(?:\((.*?)\))?/gim;
  const decorations: {range: Range, hoverMessage?: string}[] = [];
  const text = document.getText();
  let matches;

  while ((matches = regex.exec(text)) !== null) {
    let matchStart = matches.index;
    const matchEnd = matchStart + matches[0].length;
    
    // Adjust start to skip leading space or newline
    if (matches[0].startsWith(' ')) {
      matchStart += 1; // Skip the space
    } else if (matches[0].startsWith('\n') || matches[0].startsWith('\r')) {
      // Skip newline characters at the start
      matchStart += matches[0].match(/^[\r\n]+/)?.[0].length || 0;
    }
    
    const startPos = document.positionAt(matchStart);
    const endPos = document.positionAt(matchEnd);
    const range = new Range(startPos, endPos);
    
    // Trim and normalize multi-line commands
    const tickDelimiter = matches[2] || '';
    let rawCommand = matches[3] || '';

    // Only remove language identifiers for fenced triple-backtick blocks.
    if (tickDelimiter === '```') {
      rawCommand = rawCommand.replace(/^\s*[\w-]+\s*\r?\n/, '');
    }

    const command = rawCommand.trim();
    const terminalName = matches[1] || '';
    const customName = matches[4] || '';
    
    let hoverMessage = '';
    
    if (showHoverInfo) {
      const history = commandHistory.get(command);
      
      hoverMessage = `**Command Runner**\n\n`;
      hoverMessage += `Command: \`${command}\`\n\n`;
      
      if (terminalName) {
        hoverMessage += `Terminal: \`${terminalName}\`\n\n`;
      }
      
      if (customName) {
        hoverMessage += `Display Name: ${customName}\n\n`;
      }
      
      if (history) {
        hoverMessage += `---\n\n`;
        hoverMessage += `Executed ${history.executionCount} time${history.executionCount !== 1 ? 's' : ''}\n\n`;
        if (history.lastExecuted) {
          const timeAgo = getTimeAgo(history.lastExecuted);
          hoverMessage += `Last run: ${timeAgo}\n\n`;
        }
      }
      
      hoverMessage += `---\n\nClick the CodeLens above to execute`;
    }
    
    decorations.push({
      range,
      hoverMessage: hoverMessage || undefined
    });
  }

  editor.setDecorations(commandDecorationType, decorations.map(d => ({
    range: d.range,
    hoverMessage: d.hoverMessage
  })));
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  
  if (seconds < 60) {
    return `${seconds} second${seconds !== 1 ? 's' : ''} ago`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}

export function activate(context: ExtensionContext) {
  // Initialize Terminal to set up event listeners
  Terminal.initialize();

  // Create decoration type
  commandDecorationType = createDecorationType();

  const codelensProvider = new CodelensProvider();
  codelensProviderInstance = codelensProvider;

  languages.registerCodeLensProvider({ language: "markdown" }, codelensProvider);
  languages.registerCodeLensProvider({ language: "plaintext" }, codelensProvider);

  // Setup periodic refresh for time-ago updates
  const config = workspace.getConfiguration("command-runner");
  const refreshIntervalSeconds = config.get("refreshInterval", 10);
  
  refreshInterval = setInterval(() => {
    // Refresh CodeLens to update time-ago information
    if (codelensProviderInstance) {
      codelensProviderInstance.refresh();
    }
    // Refresh decorations to update hover time-ago information
    if (window.activeTextEditor) {
      updateDecorations(window.activeTextEditor);
    }
  }, refreshIntervalSeconds * 1000); // Convert seconds to milliseconds

  commands.registerCommand("command-runner.enableCodeLens", () => {
    workspace
      .getConfiguration("command-runner")
      .update("enableCodeLens", true, true);
  });

  commands.registerCommand("command-runner.disableCodeLens", () => {
    workspace
      .getConfiguration("command-runner")
      .update("enableCodeLens", false, true);
  });

  commands.registerCommand("command-runner.codelensAction", async (command: string, terminalName?: string) => {
    if (!await Terminal.run(command, terminalName)) {
      return;
    }
    trackCommandExecution(command);
    // Update decorations and CodeLens to reflect new execution history
    if (window.activeTextEditor) {
      setTimeout(() => {
        updateDecorations(window.activeTextEditor);
        if (codelensProviderInstance) {
          codelensProviderInstance.refresh();
        }
      }, 100);
    }
  });

  commands.registerCommand("command-runner.showHistory", async () => {
    const history = Terminal.getHistory();
    
    if (history.length === 0) {
      window.showInformationMessage('No command history available yet');
      return;
    }

    interface HistoryQuickPickItem extends QuickPickItem {
      command: string;
      terminalName: string;
    }

    // Calculate time-ago dynamically when showing history
    const items: HistoryQuickPickItem[] = history.map(entry => {
      const timeAgo = getTimeAgo(entry.timestamp);
      return {
        label: `$(terminal) ${entry.command}`,
        description: `${entry.terminalName} • ${timeAgo}`,
        detail: `Executed ${entry.executionCount} time${entry.executionCount !== 1 ? 's' : ''}`,
        command: entry.command,
        terminalName: entry.terminalName === 'default' ? '' : entry.terminalName
      };
    });

    const selected = await window.showQuickPick(items, {
      placeHolder: 'Select a command to execute',
      matchOnDescription: true,
      matchOnDetail: true
    });

    if (selected) {
      if (!await Terminal.run(selected.command, selected.terminalName)) {
        return;
      }
      // Refresh after execution
      setTimeout(() => {
        if (window.activeTextEditor) {
          updateDecorations(window.activeTextEditor);
        }
        if (codelensProviderInstance) {
          codelensProviderInstance.refresh();
        }
      }, 100);
    }
  });

  commands.registerCommand("command-runner.clearHistory", async () => {
    const answer = await window.showWarningMessage(
      'Are you sure you want to clear the command history?',
      'Clear',
      'Cancel'
    );
    
    if (answer === 'Clear') {
      Terminal.clearHistory();
      commandHistory.clear();
      window.showInformationMessage('Command history cleared');
      updateDecorations(window.activeTextEditor);
    }
  });

  // Update decorations when active editor changes
  window.onDidChangeActiveTextEditor(editor => {
    updateDecorations(editor);
  }, null, context.subscriptions);

  // Update decorations when document changes
  workspace.onDidChangeTextDocument(event => {
    if (window.activeTextEditor && event.document === window.activeTextEditor.document) {
      updateDecorations(window.activeTextEditor);
    }
  }, null, context.subscriptions);

  // Update decorations when configuration changes
  workspace.onDidChangeConfiguration(event => {
    if (event.affectsConfiguration("command-runner")) {
      // Recreate decoration type with new colors
      commandDecorationType.dispose();
      commandDecorationType = createDecorationType();
      updateDecorations(window.activeTextEditor);
    }
  }, null, context.subscriptions);

  // Initial decoration update
  updateDecorations(window.activeTextEditor);
}

export function deactivate() {
  // Clear refresh interval
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = undefined;
  }
  
  // Dispose decoration type
  if (commandDecorationType) {
    commandDecorationType.dispose();
  }
  
  // Dispose Terminal resources
  Terminal.dispose();
  commandHistory.clear();
  
  if (disposables) {
    disposables.forEach((item) => item.dispose());
  }
  disposables = [];
  codelensProviderInstance = undefined;
}
