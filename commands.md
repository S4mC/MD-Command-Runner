# Commands to Develop and Test the Extension

## Initial Installation
Install dependencies: run `npm install`(Install dependencies)

## Development

You just need to run the program from **debug mode** to open a new VSC window and see the extension there.

 run test`npm run test`(Run tests)

## Package Extension to VSIX

Install vsce globally: run package-install`npm install -g @vscode/vsce`(Install VSCE)

Compile the extension: run compile`npm run compile; vsce package`(Compile and created package)

The VSIX file will be created in the root directory and can be installed in VS Code via Extensions → Install from VSIX...