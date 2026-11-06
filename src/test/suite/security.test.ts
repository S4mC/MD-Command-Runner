import * as assert from 'assert';
import { readFileSync } from 'fs';
import { runInNewContext } from 'vm';

// Load the real compiled implementation with a VS Code double. No real shell
// or editor is started by these security regression tests.
function createHarness() {
  const sent: { text: string; execute: boolean }[] = [];
  const dialogs: { message: string; detail?: string; modal?: boolean }[] = [];
  const errors: string[] = [];
  const logs: unknown[] = [];
  let created = 0;
  let answer: string | undefined = 'Execute';
  let onConfirm = () => {};
  let dangerousWarnings: boolean | undefined;
  const terminal = {
    name: 'Command Runner',
    show() {},
    dispose() {},
    sendText(text: string, execute: boolean) { sent.push({ text, execute }); }
  };
  const vscode = {
    workspace: {
      isTrusted: true,
      workspaceFolders: [{ uri: { fsPath: 'C:\\trusted workspace' }, name: 'trusted workspace' }],
      asRelativePath: () => 'file.md',
      getConfiguration: () => ({ get: (_key: string, fallback: boolean) => dangerousWarnings ?? fallback })
    },
    window: {
      activeTextEditor: { document: { uri: { fsPath: 'C:\\trusted workspace\\file.md' } } },
      terminals: [terminal],
      createTerminal: () => { created++; return terminal; },
      showWarningMessage: async (message: string, options?: { detail?: string; modal?: boolean }) => {
        dialogs.push({ message, ...options });
        if (options?.modal) {
          onConfirm();
          return answer;
        }
        return undefined;
      },
      showErrorMessage: (message: string) => { errors.push(message); }
    }
  };
  const moduleExports = {} as Record<'Terminal', typeof import('../../Terminal').Terminal>;
  runInNewContext(readFileSync(require.resolve('../../Terminal'), 'utf8'), {
    exports: moduleExports,
    require: (name: string) => {
      assert.strictEqual(name, 'vscode');
      return vscode;
    },
    console: { log: (...args: unknown[]) => logs.push(args), error: (...args: unknown[]) => logs.push(args) }
  });
  return {
    runner: moduleExports.Terminal, vscode, sent, dialogs, errors, logs,
    get created() { return created; },
    setAnswer(value: string | undefined) { answer = value; },
    onConfirm(callback: () => void) { onConfirm = callback; },
    enableDangerousWarnings() { dangerousWarnings = true; },
    disableDangerousWarnings() { dangerousWarnings = false; }
  };
}

suite('Command execution security', () => {
  test('Blocks direct execution in an untrusted workspace', async () => {
    const h = createHarness();
    h.vscode.workspace.isTrusted = false;
    assert.strictEqual(await h.runner.run('echo safe'), false);
    assert.strictEqual(h.created, 0);
    assert.strictEqual(h.sent.length, 0);
    assert.strictEqual(h.runner.getHistory().length, 0);
    assert.ok(h.dialogs[0].message.includes('Trust'));
  });

  test('Shows the entire expanded command and target when confirmation is enabled', async () => {
    const h = createHarness();
    h.enableDangerousWarnings();
    const command = 'sudo rm "${workspaceFolder}" && echo review-this-too';
    assert.strictEqual(await h.runner.run(command, 'build'), true);
    assert.strictEqual(h.dialogs.length, 1);
    assert.strictEqual(h.dialogs[0].modal, true);
    assert.strictEqual(h.dialogs[0].detail, 'Terminal: build\n\nsudo rm "C:\\trusted workspace" && echo review-this-too');
    assert.strictEqual(h.sent[0].text, h.dialogs[0].detail!.split('\n\n')[1]);
    assert.strictEqual(h.sent[0].execute, true);
  });

  test('Cancellation or dismissal creates no terminal and records no history', async () => {
    for (const answer of [undefined, 'Cancel']) {
      const h = createHarness();
      h.enableDangerousWarnings();
      h.setAnswer(answer);
      assert.strictEqual(await h.runner.run('sudo rm /example'), false);
      assert.strictEqual(h.created, 0);
      assert.strictEqual(h.sent.length, 0);
      assert.strictEqual(h.runner.getHistory().length, 0);
      assert.strictEqual(h.runner.getCommandStats('sudo rm /example'), undefined);
    }
  });

  test('Dangerous commands execute without confirmation by default', async () => {
    const h = createHarness();
    h.setAnswer(undefined);
    assert.strictEqual(await h.runner.run('rm -rf /example'), true);
    assert.strictEqual(h.dialogs.length, 0);
    assert.strictEqual(h.sent[0].text, 'rm -rf /example');
  });

  test('Explicitly disabling confirmation executes dangerous commands directly', async () => {
    const h = createHarness();
    h.disableDangerousWarnings();
    h.setAnswer(undefined);
    assert.strictEqual(await h.runner.run('rm -rf /example'), true);
    assert.strictEqual(h.dialogs.length, 0);
    assert.strictEqual(h.sent[0].text, 'rm -rf /example');
  });

  test('Enabling dangerous-command confirmation does not prompt for other commands', async () => {
    const h = createHarness();
    h.enableDangerousWarnings();
    h.setAnswer(undefined);
    assert.strictEqual(await h.runner.run('echo safe'), true);
    assert.strictEqual(h.dialogs.length, 0);
    assert.strictEqual(h.sent[0].text, 'echo safe');
  });

  test('Reexecuting a history command does not prompt by default', async () => {
    const h = createHarness();
    await h.runner.run('sudo rm /example');
    const entry = h.runner.getHistory()[0];
    assert.strictEqual(await h.runner.run(entry.command), true);
    assert.strictEqual(h.dialogs.length, 0);
    assert.strictEqual(h.sent.length, 2);
  });

  test('Recognized dangerous commands receive an additional warning', async () => {
    const h = createHarness();
    h.enableDangerousWarnings();
    h.setAnswer(undefined);
    await h.runner.run('sudo rm /example');
    assert.ok(h.dialogs[0].message.includes('dangerous'));
    assert.strictEqual(h.dialogs[0].detail, 'Terminal: Command Runner\n\nsudo rm /example');
  });

  test('Rechecks trust after the confirmation resolves', async () => {
    const h = createHarness();
    h.enableDangerousWarnings();
    h.onConfirm(() => { h.vscode.workspace.isTrusted = false; });
    assert.strictEqual(await h.runner.run('sudo rm /example'), false);
    assert.strictEqual(h.created, 0);
    assert.strictEqual(h.sent.length, 0);
  });

  test('Freezes the reviewed expansion while the editor changes', async () => {
    const h = createHarness();
    h.enableDangerousWarnings();
    h.onConfirm(() => { h.vscode.window.activeTextEditor.document.uri.fsPath = 'C:\\other.md'; });
    assert.strictEqual(await h.runner.run('sudo rm "${file}"'), true);
    assert.strictEqual(h.sent[0].text, 'sudo rm "C:\\trusted workspace\\file.md"');
  });

  test('Rejects malformed public command arguments without opening a terminal', async () => {
    for (const command of ['', '   ', null, undefined, 1, {}]) {
      const h = createHarness();
      assert.strictEqual(await h.runner.run(command as string), false);
      assert.strictEqual(h.created, 0);
      assert.strictEqual(h.sent.length, 0);
    }
    const h = createHarness();
    assert.strictEqual(await h.runner.run('echo safe', {} as string), false);
    assert.strictEqual(h.created, 0);
  });

  test('Rejects terminal control sequences and visual direction overrides', async () => {
    for (const control of ['\x00', '\x03', '\x08', '\t', '\x1b[2K', '\x1b[201~', '\x7f', '\x9b', '\u202e', '\u2066', '\u200f', '\r']) {
      const h = createHarness();
      assert.strictEqual(await h.runner.run(`echo safe${control}hidden`), false);
      assert.strictEqual(h.created, 0);
      assert.strictEqual(h.sent.length, 0);
    }
  });

  test('Rejects control characters and oversized terminal names', async () => {
    for (const name of ['build\nhidden', 'build\thidden', '\x1b[2K', '\u202e', 'a'.repeat(101)]) {
      const h = createHarness();
      assert.strictEqual(await h.runner.run('echo safe', name), false);
      assert.strictEqual(h.created, 0);
    }
  });

  test('Rejects oversized commands', async () => {
    const h = createHarness();
    assert.strictEqual(await h.runner.run('a'.repeat(16385)), false);
    assert.strictEqual(h.created, 0);
  });

  test('Blocks shell injection from file and workspace variable values', async () => {
    for (const name of ['file;echo injected.md', '$(echo injected).md', 'file&echo injected.md', 'file`echo injected`.md', 'file\necho injected.md', 'file".md', "file'.md", '${workspaceFolder}.md', '$&.md', '%COMSPEC%.md']) {
      const h = createHarness();
      h.vscode.window.activeTextEditor.document.uri.fsPath = `C:\\project\\${name}`;
      assert.strictEqual(await h.runner.run('echo "${fileBasename}"'), false);
      assert.strictEqual(h.created, 0);
      assert.strictEqual(h.sent.length, 0);
      assert.strictEqual(h.errors.length, 1);
    }
    const h = createHarness();
    h.vscode.workspace.workspaceFolders[0].uri.fsPath = 'C:\\project & echo injected';
    assert.strictEqual(await h.runner.run('echo "${workspaceFolder}"'), false);
    assert.strictEqual(h.created, 0);
  });

  test('Refuses unresolved extension variables', async () => {
    const h = createHarness();
    h.vscode.workspace.workspaceFolders = [];
    assert.strictEqual(await h.runner.run('echo ${workspaceFolder}'), false);
    assert.strictEqual(h.created, 0);
    assert.ok(h.errors[0].includes('unavailable'));
  });

  test('Preserves multiline safety guards, comments, quotes and continuations', async () => {
    const commands = [
      'cd /nonexistent &&\n  echo must-not-run',
      'echo "first\n# this is string content\nlast"',
      'echo before\n# a comment\necho after',
      'echo before # comment\necho after',
      'echo first \\\n  second',
      'cat <<EOF\nbody\nEOF'
    ];
    for (const command of commands) {
      const h = createHarness();
      assert.strictEqual(await h.runner.run(command), true);
      assert.strictEqual(h.sent.length, 1);
      assert.strictEqual(h.sent[0].text, command);
      assert.strictEqual(h.dialogs.length, 0);
    }
  });

  test('Normalizes CRLF once before sending', async () => {
    const h = createHarness();
    assert.strictEqual(await h.runner.run('echo first\r\necho second'), true);
    assert.strictEqual(h.sent[0].text, 'echo first\necho second');
    assert.strictEqual(h.dialogs.length, 0);
  });

  test('Does not leak executed commands into extension logs', async () => {
    const h = createHarness();
    await h.runner.run('echo secret-token');
    assert.strictEqual(h.logs.length, 0);
  });

  test('Does not record an execution when sending to the terminal fails', async () => {
    const h = createHarness();
    h.vscode.window.terminals[0].sendText = () => { throw new Error('Terminal closed'); };
    assert.strictEqual(await h.runner.run('echo safe'), false);
    assert.strictEqual(h.runner.getHistory().length, 0);
    assert.strictEqual(h.runner.getCommandStats('echo safe'), undefined);
    assert.strictEqual(h.errors.length, 1);
  });

  test('Clears sensitive in-memory history when disposed', async () => {
    const h = createHarness();
    await h.runner.run('echo secret-token');
    assert.strictEqual(h.runner.getHistory().length, 1);
    h.runner.dispose();
    assert.strictEqual(h.runner.getHistory().length, 0);
    assert.strictEqual(h.runner.getCommandStats('echo secret-token'), undefined);
  });
});
