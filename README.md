# MD Command Runner

Fork of https://github.com/zvikarp/command-runner

With this extension, you can run code snippets from markdown and plaintext files with powerful customization options.

<img width="756" alt="Screenshot 2026-04-04 123542" src="https://github.com/user-attachments/assets/9ecd01da-09b6-48cb-8054-9915b1e7e00b" />


## How to Use

- By default the extension is enabled, you can toggle it using the command palette. Trigger the command palette (Ctrl / Cmd + Shift + P) -> Command Runner: Enable / Disable.
- Once it is enabled, above every line that contains the word 'run' followed by a code snippet (e.g. run ````npm -V````) appears a button to execute the command.

### Basic Syntax

**Default terminal:**
````markdown
run `npm install`
````

**Named terminal** (all commands with the same name go to the same terminal):
````markdown
run test`npm test`
run build`npm run build`
run server`node app.js`
````

**Custom display name** (personalize what appears in the CodeLens button):
````markdown
run `npm install`(Install Dependencies)
run `npm test`(Run Tests)
run `npm run dev`(Start Dev Server)
````

Simply write any name before the backticks to create or reuse a named terminal. If no name is provided, commands run in the default "Command Runner" terminal. Add text in parentheses after the command to customize the button display name.

### Examples

````markdown
# Quick commands (default terminal)
run `node --version`
run `npm -v`

# Organized workflows (named terminals)
run dev`npm run dev`
run test`npm test -- --watch`
run build`npm run build`
run lint`npm run lint`

# Custom display names
run `npm install`(Install)
run `npm test`(Test Suite)
run `npm run dev`(Dev Server)
run `npm run build`(Build Project)
run `git status`(Git Status)

# Combining named terminals with custom display
run dev`npm run dev`(Start Development)
run test`npm test -- --watch`(Watch Tests)

# Variable substitution
run `cd ${workspaceFolder} && npm test`
run `echo Current file: ${fileBasename}`
````

## Features

- Works in **Markdown** and **Plain Text** files
- Simple syntax: just add a name before backticks
- Named terminals persist - reuse them for related commands
- Supports single (\`command\`), double (\``command``), and triple (\```command```) backticks
- **Custom display names** - personalize button text with parentheses syntax
- **Customizable icons** - choose from multiple icon options (▶︎, ⚡, 🚀, etc.)
- **Visual decorations** - commands highlighted with subtle background or outlined style
- **Hover information** - see execution statistics on hover
- **Command history** - track and re-execute previous commands
- **Variable substitution** - use `${workspaceFolder}`, `${file}`, and more
- **Safety features** - confirmation for dangerous commands
- **Markdown editor syntax support for multiline run blocks** - `run ```bash ... ```(Name)` keeps fenced block highlighting in `.md`

## Configuration

### CodeLens Settings

- **`command-runner.enableCodeLens`** (default: `true`)  
  Enable or disable CodeLens for command execution

- **`command-runner.codeLensIcon`** (default: `"▶︎"`)  
  Choose icon: `"▶︎"`, `"►"`, `"▶"`, `"⚡"`, `"🚀"`, `"⚙️"`, `"✦"`, `"●"`

### Decoration Settings

- **`command-runner.enableDecorations`** (default: `true`)  
  Enable or disable command decorations

- **`command-runner.decorationStyle`** (default: `"background"`)  
  Choose style: `"background"` (subtle full-line highlight) or `"outline"` (boxed command)

- **`command-runner.showHoverInfo`** (default: `true`)  
  Show execution statistics when hovering over commands

- **`command-runner.decorationBorderColor`** (default: `"#569cd6"`)  
  Border color for `"outline"` style decorations (hex color codes)

- **`command-runner.decorationBackgroundColor`** (default: `"rgba(86, 156, 214, 0.1)"`)  
  Background color for command decorations

### Safety & Behavior

- **`command-runner.confirmDangerousCommands`** (default: `true`)  
  Confirm before executing dangerous commands

### Display Settings

- **`command-runner.maxDisplayLength`** (default: `15`)  
  Maximum command length in CodeLens

- **`command-runner.maxCustomNameLength`** (default: `50`)  
  Maximum custom name length

- **`command-runner.refreshInterval`** (default: `10`)  
  Refresh interval in seconds for time-ago updates (5-300 seconds)

### Variable Substitution

Use these variables in your commands:

- **`${workspaceFolder}`** - The path of the workspace folder
- **`${workspaceFolderBasename}`** - The name of the workspace folder without any slashes (/)
- **`${file}`** - The current opened file absolute path
- **`${fileBasename}`** - The current opened file's basename (filename with extension)
- **`${fileBasenameNoExtension}`** - The current opened file's basename without extension
- **`${fileDirname}`** - The current opened file's directory path
- **`${relativeFile}`** - The current opened file relative to workspace folder

**Examples:**
```markdown
run `cd ${workspaceFolder} && npm test`
run `echo Current file: ${fileBasename}`
run `ls ${fileDirname}`
run `code ${file}`
```

## Commands

- **Command Runner: Show Command History** - Re-execute commands
- **Command Runner: Clear Command History** - Clear history

### Example Configuration

Add these settings to your `settings.json`:

```json
{
  "command-runner.enableDecorations": true,
  "command-runner.decorationStyle": "background",
  "command-runner.showHoverInfo": true,
  "command-runner.codeLensIcon": "🚀",
  "command-runner.decorationBorderColor": "#4ec9b0",
  "command-runner.decorationBackgroundColor": "rgba(78, 201, 176, 0.15)",
  "command-runner.confirmDangerousCommands": true,
  "command-runner.refreshInterval": 10,
  "command-runner.maxDisplayLength": 20,
  "command-runner.maxCustomNameLength": 60
}
```
