import * as vscode from "vscode";

interface CommandHistoryEntry {
  command: string;
  timestamp: Date;
  terminalName: string;
  executionCount: number;
}

export class Terminal {
  static defaultTermName: string = "Command Runner";
  static defaultTerm: vscode.Terminal | undefined;
  static namedTerminals: Map<string, vscode.Terminal> = new Map();
  static closeTerminalListenerDisposable: vscode.Disposable | undefined;
  static commandHistory: CommandHistoryEntry[] = [];
  static maxHistorySize: number = 50;
  static commandStats: Map<string, { count: number; lastExecuted: Date }> = new Map();

  static initialize() {
    // Register the close terminal listener only once
    if (!Terminal.closeTerminalListenerDisposable) {
      Terminal.closeTerminalListenerDisposable = vscode.window.onDidCloseTerminal((event) => {
        if (event.name === Terminal.defaultTermName) {
          Terminal.defaultTerm = undefined;
        } else {
          // Remove from named terminals map
          for (const [name, term] of Terminal.namedTerminals.entries()) {
            if (term === event) {
              Terminal.namedTerminals.delete(name);
              break;
            }
          }
        }
      });
    }
  }

  static _isTerminalValid(terminal: vscode.Terminal | undefined): boolean {
    if (!terminal) {
      return false;
    }
    // Check if the terminal still exists in the active terminals
    return vscode.window.terminals.includes(terminal);
  }

  static _getDefaultTerm(): vscode.Terminal {
    try {
      // Check if the existing terminal is still valid
      if (Terminal.defaultTerm && !Terminal._isTerminalValid(Terminal.defaultTerm)) {
        Terminal.defaultTerm = undefined;
      }

      if (!Terminal.defaultTerm) {
        Terminal.defaultTerm = vscode.window.createTerminal(Terminal.defaultTermName);
      }
      // Always show the terminal, even if it already existed
      Terminal.defaultTerm.show(true);
      return Terminal.defaultTerm;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Command Runner: Failed to create default terminal - ${errorMessage}`);
      throw error;
    }
  }

  static _getNamedTerm(name: string): vscode.Terminal {
    try {
      let term = Terminal.namedTerminals.get(name);
      
      // Check if the existing terminal is still valid
      if (term && !Terminal._isTerminalValid(term)) {
        Terminal.namedTerminals.delete(name);
        term = undefined;
      }

      if (!term) {
        term = vscode.window.createTerminal(name ? name : 'Command Runner');
        Terminal.namedTerminals.set(name, term);
      }
      term.show(true);
      return term;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Command Runner: Failed to create terminal "${name}" - ${errorMessage}`);
      throw error;
    }
  }

  static _replaceVariables(command: string): string {
    const editor = vscode.window.activeTextEditor;
    const workspaceFolders = vscode.workspace.workspaceFolders;
    
    // Replace workspace variables
    if (workspaceFolders && workspaceFolders.length > 0) {
      command = command.replace(/\$\{workspaceFolder\}/g, workspaceFolders[0].uri.fsPath);
      command = command.replace(/\$\{workspaceFolderBasename\}/g, workspaceFolders[0].name);
    }
    
    // Replace file-related variables
    if (editor) {
      const filePath = editor.document.uri.fsPath;
      const fileName = filePath.split(/[\\/]/).pop() || '';
      const fileBasename = fileName.replace(/\.[^.]*$/, '');
      const fileDirname = filePath.substring(0, Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/')));
      
      command = command.replace(/\$\{file\}/g, filePath);
      command = command.replace(/\$\{fileBasename\}/g, fileName);
      command = command.replace(/\$\{fileBasenameNoExtension\}/g, fileBasename);
      command = command.replace(/\$\{fileDirname\}/g, fileDirname);
      command = command.replace(/\$\{relativeFile\}/g, 
        workspaceFolders ? vscode.workspace.asRelativePath(filePath) : filePath);
    }
    
    return command;
  }

  static _isDangerousCommand(command: string): boolean {
    const config = vscode.workspace.getConfiguration("command-runner");
    const enabled = config.get("confirmDangerousCommands", true);
    
    if (!enabled) {
      return false;
    }
    
    const dangerousPatterns = [
      /rm\s+-rf\s+[\/\\]/i,
      /del\s+\/[sq]/i,
      /format\s+/i,
      /dd\s+if=/i,
      /mkfs\./i,
      />[\s]*\/dev\//i,
      /:(){ :|:& };:/,  // Fork bomb
      /curl.*\|\s*bash/i,
      /wget.*\|\s*sh/i,
      /chmod\s+777/i,
      /sudo\s+rm/i,
      /npm\s+install.*-g/i,
    ];
    
    return dangerousPatterns.some(pattern => pattern.test(command));
  }

  static async run(command: string, terminalName: string = '') {
    try {
      if (!command || command.trim() === '') {
        vscode.window.showWarningMessage('Command Runner: Cannot execute an empty command');
        return;
      }

      // Replace variables
      const processedCommand = Terminal._replaceVariables(command);
      
      // Check if command is dangerous
      if (Terminal._isDangerousCommand(processedCommand)) {
        const answer = await vscode.window.showWarningMessage(
          `⚠️ This command may be dangerous: \`${processedCommand}\`\n\nAre you sure you want to execute it?`,
          { modal: true },
          'Execute'
        );
        
        if (answer !== 'Execute') {
          return;
        }
      }

      let term: vscode.Terminal;

      if (terminalName) {
        term = Terminal._getNamedTerm(terminalName);
      } else {
        term = Terminal._getDefaultTerm();
      }

      console.log(processedCommand);
      // Check if command has multiple lines
      const lines = processedCommand.split(/\r?\n/).filter(line => line.trim() !== '');
      
      if (lines.length > 1) {
        // Execute each line separately to simulate pasting multiple commands
        let commandToSend = '';
        for (const line of lines) {
          if (line.trim() === '' || line.trim().startsWith('#') || line.trim().startsWith('//') || line.trim().startsWith('--') || line.trim().startsWith('REM')) {
            continue;
          }
          commandToSend += line.trim() + ';'; // Use semicolon to separate commands, because new lines execute immediately
        }
        term.sendText(commandToSend, true);
      } else {
        // Single line command
        term.sendText(processedCommand, true);
      }
      
      // Track command history
      Terminal._addToHistory(processedCommand, terminalName);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Command Runner: Failed to execute command - ${errorMessage}`);
      console.error('Command Runner error:', error);
    }
  }

  static _addToHistory(command: string, terminalName: string) {
    // Update stats
    const stats = Terminal.commandStats.get(command) || { count: 0, lastExecuted: new Date() };
    stats.count++;
    stats.lastExecuted = new Date();
    Terminal.commandStats.set(command, stats);

    // Add to history
    Terminal.commandHistory.unshift({
      command,
      timestamp: new Date(),
      terminalName: terminalName || 'default',
      executionCount: stats.count
    });

    // Limit history size
    if (Terminal.commandHistory.length > Terminal.maxHistorySize) {
      Terminal.commandHistory = Terminal.commandHistory.slice(0, Terminal.maxHistorySize);
    }
  }

  static getCommandStats(command: string): { count: number; lastExecuted: Date } | undefined {
    return Terminal.commandStats.get(command);
  }

  static getHistory(): CommandHistoryEntry[] {
    return [...Terminal.commandHistory];
  }

  static clearHistory() {
    Terminal.commandHistory = [];
    Terminal.commandStats.clear();
  }

  static dispose() {
    if (Terminal.closeTerminalListenerDisposable) {
      Terminal.closeTerminalListenerDisposable.dispose();
      Terminal.closeTerminalListenerDisposable = undefined;
    }
    if (Terminal.defaultTerm) {
      Terminal.defaultTerm.dispose();
      Terminal.defaultTerm = undefined;
    }
    for (const term of Terminal.namedTerminals.values()) {
      term.dispose();
    }
    Terminal.namedTerminals.clear();
  }
}
