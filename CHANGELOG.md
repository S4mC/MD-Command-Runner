# Change Log

All notable changes to the "command-runner" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

### Security
- Make dangerous-command confirmation opt-in through the user-level `command-runner.confirmDangerousCommands` setting (default: `false`); show the complete expanded command and target terminal only when confirmation is enabled and a dangerous pattern matches.
- Explicitly declare Workspace Trust requirements and check trust before execution and after confirmation.
- Reject terminal control characters, text direction overrides, oversized input and shell metacharacters in substituted path values.
- Substitute variables in a single pass and fail when an extension variable is unavailable.
- Preserve multiline shell syntax rather than rewriting lines with semicolons.
- Remove command text from extension console logging and clear terminal history on disposal.
- Record execution statistics only after a command is sent successfully.

## [0.5.3] - 2026-04-04

### Added
- **Decoration Style Mode:** New setting `command-runner.decorationStyle`
  - `background` for subtle full-line highlighting
  - `outline` for boxed command highlighting
- **Markdown Editor Grammar Injection:** Added custom Markdown injection grammar for Command Runner syntax
  - Recognizes fenced command blocks with `run` prefix and optional terminal names
  - Supports language-aware highlighting for common fenced languages (`bash`, `powershell`, `python`, `javascript`, `typescript`)
  - Supports custom fence closing syntax with optional display names in parentheses
- **Inline Command Highlighting in Markdown:** Added syntax highlighting for inline Command Runner commands
  - Supports inline run syntax using one or two backticks
  - Supports named terminals before the command expression
  - Supports optional custom names at the end in parentheses
  - Works both at line start and when embedded in normal Markdown text

### Changed
- **Decoration Defaults:** Decorations now default to a less saturated background style instead of per-command outlined boxes
- Updated decoration setting descriptions to reflect style-based behavior
- Updated documentation to include the new decoration mode and Markdown editor syntax support

## [0.5.0] - 2025-11-13

### Added
- **Variable Substitution:** Support for variables in commands
  - `${workspaceFolder}`, `${file}`, `${fileBasename}`, `${fileDirname}`, and more
  - Automatically replaced before command execution
- **Dangerous Command Detection:** Confirmation prompts for potentially harmful commands
  - Detects patterns like `rm -rf`, `del /s`, `format`, `dd if=`, etc.
  - Configurable via `command-runner.confirmDangerousCommands`
- **Command History:** Track and re-execute previous commands
  - New command: "Show Command History" - Browse and execute from history
  - New command: "Clear Command History" - Clear the history
  - Stores last 50 commands with timestamps and execution counts
- **Hover Information:** Display execution statistics on command hover
  - Shows execution count and last run time
  - Configurable via `command-runner.showHoverInfo`
- **Customizable Icons:** Choose from multiple CodeLens icons
  - Options: ▶︎, ►, ▶, ⚡, 🚀, ⚙️, ✦, ●
  - Configuration: `command-runner.codeLensIcon`
- **Auto-refresh Time Information:** Automatic updates of time-ago displays
  - Configurable refresh interval (5-300 seconds)
  - Updates CodeLens tooltips and hover information dynamically
- Enhanced tooltips in CodeLens with execution statistics

### Changed
- Improved decoration hover messages with command details
- Enhanced CodeLens tooltips with statistics
- Better command tracking and analytics
- Time-ago information now updates automatically every 10 seconds (configurable)

## [0.4.0] - 2025-11-13

### Added
- **Visual Decorations:** Commands are now highlighted with a customizable border rectangle
- New setting `command-runner.enableDecorations` to toggle decorations on/off
- New setting `command-runner.decorationBorderColor` to customize border color (default: `#569cd6`)
- New setting `command-runner.decorationBackgroundColor` to customize background color (default: `rgba(86, 156, 214, 0.1)`)
- Decorations update in real-time when editing documents
- Support for custom colors using hex codes or rgba values

### Changed
- Improved visual feedback for command identification in text
- Enhanced user experience with better command visibility

## [0.3.1] - 2025-10-06

### Fixed
- **Terminal Management:** Fixed issue where commands would not execute after closing terminals
- Added automatic terminal validation before command execution
- Terminal references are now properly checked and recreated when closed
- Improved event listener registration to prevent memory leaks
- Terminal dispose method now properly cleans up all resources

## [0.3.0] - 2025-10-05

### Added
- **Custom Display Names:** New syntax to personalize CodeLens button text using parentheses: ```` run `command`(Custom Name) ````
- Support for descriptive names in custom display names for better visual organization
- Custom names work with both default and named terminals
- Button shows only ▶︎ symbol + custom name when specified

### Changed
- Improved regex pattern to capture custom display names
- Enhanced CodeLens title generation logic

### Examples
````markdown
run `npm install`(Install Dependencies)
run dev`npm run dev`(Start Dev Server)
run test`npm test`(Run Tests)
````

## [0.2.0]

### Added
- Support for named terminals
- Extension now activates in any file
- Simplified syntax: any text before backticks becomes the terminal name

### Changed
- Terminal management improved with named terminal map
- CodeLens provider updated to handle terminal names

## [0.1.2]

### Fixed
- Minor bug fixes and improvements

## [0.1.0]

### Added
- Initial release
- Basic command execution from markdown files
- Support for single, double, and triple backticks
- CodeLens integration for visual command execution
