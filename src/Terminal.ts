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
  // Reject terminal escape sequences, control keys and text direction overrides.
  // Only LF/CRLF line endings are allowed as command control characters.
  private static readonly unsafeCharacters = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/;

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
    
    const variables = new Map<string, string>();
    if (workspaceFolders && workspaceFolders.length > 0) {
      variables.set('workspaceFolder', workspaceFolders[0].uri.fsPath);
      variables.set('workspaceFolderBasename', workspaceFolders[0].name);
    }
    
    // Replace file-related variables
    if (editor) {
      const filePath = editor.document.uri.fsPath;
      const fileName = filePath.split(/[\\/]/).pop() || '';
      const fileBasename = fileName.replace(/\.[^.]*$/, '');
      const fileDirname = filePath.substring(0, Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/')));
      
      variables.set('file', filePath);
      variables.set('fileBasename', fileName);
      variables.set('fileBasenameNoExtension', fileBasename);
      variables.set('fileDirname', fileDirname);
      variables.set('relativeFile', workspaceFolders ? vscode.workspace.asRelativePath(filePath) : filePath);
    }

    // Use literal replacement in a single pass, without interpreting replacement
    // patterns or introducing further extension variable expansions.
    return command.replace(/\$\{(workspaceFolder|workspaceFolderBasename|file|fileBasename|fileBasenameNoExtension|fileDirname|relativeFile)\}/g, (match, name: string) => {
      const value = variables.get(name);
      if (value === undefined) {
        throw new Error(`Variable \${${name}} is unavailable in the current editor or workspace`);
      }
      // The terminal's shell and the surrounding quote context are arbitrary.
      // Refuse shell syntax in path values instead of attempting unsafe quoting.
      // Ordinary spaces are permitted; commands must quote paths containing them.
      if (/[^\S ]|["'`$&;|<>(){}\[\]*?!~#%^]/u.test(value) || Terminal.unsafeCharacters.test(value)) {
        throw new Error(`Variable \${${name}} contains characters that are unsafe for shell substitution`);
      }
      return value;
    });
  }

  static _isDangerousCommand(command: string): boolean {
    const config = vscode.workspace.getConfiguration("command-runner");
    const enabled = config.get<boolean>("confirmDangerousCommands", false);
    
    if (enabled !== true) {
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

  static async run(command: string, terminalName: string = ''): Promise<boolean> {
    try {
      if (!vscode.workspace.isTrusted) {
        vscode.window.showWarningMessage('Command Runner: Trust this workspace before executing commands');
        return false;
      }

      if (typeof command !== 'string' || command.trim() === '' || typeof terminalName !== 'string') {
        vscode.window.showWarningMessage('Command Runner: Command must be a non-empty string and terminal name must be a string');
        return false;
      }

      const processedCommand = Terminal._replaceVariables(command).replace(/\r\n/g, '\n');
      if (processedCommand.length > 16384 || terminalName.length > 100 ||
          Terminal.unsafeCharacters.test(processedCommand) || /[\r\n\t]/.test(terminalName) ||
          Terminal.unsafeCharacters.test(terminalName)) {
        vscode.window.showWarningMessage('Command Runner: Command or terminal name is too long or contains unsafe control characters');
        return false;
      }

      // Commands are authored by the user. Confirm recognized dangerous commands
      // only when the user explicitly enables this optional safeguard.
      if (Terminal._isDangerousCommand(processedCommand)) {
        const answer = await vscode.window.showWarningMessage(
          'Command Runner: This command may be dangerous. Execute it?',
          { modal: true, detail: `Terminal: ${terminalName || Terminal.defaultTermName}\n\n${processedCommand}` },
          'Execute'
        );
        if (answer !== 'Execute' || !vscode.workspace.isTrusted) {
          return false;
        }
      }

      let term: vscode.Terminal;

      if (terminalName) {
        term = Terminal._getNamedTerm(terminalName);
      } else {
        term = Terminal._getDefaultTerm();
      }

      // Preserve quotes, comments, continuations and conditional execution.
      // Joining lines with semicolons can change which commands are executed.
      term.sendText(processedCommand, true);
      
      // Track command history
      Terminal._addToHistory(processedCommand, terminalName);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Command Runner: Failed to execute command - ${errorMessage}`);
      return false;
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
    Terminal.clearHistory();
  }
}
