# VS Code Extension Development

## Files

* `package.json` - Extension manifest 
* `src/extension.ts` - Main implementation

## Development

* Press `F5` to run with extension loaded
* `Ctrl+Shift+P` or `Cmd+Shift+P` to open command palette
* Set breakpoints in `src/extension.ts` to debug
* Debug output is in the debug console

## Make changes

* Relaunch from debug toolbar after code changes
* Or reload (`Ctrl+R` or `Cmd+R`) VS Code window

## Build and package

* Run `npm run package` to build the extension
* Run `npx vsce package` to create a VSIX file
* Install the VSIX file from VS Code's Extensions view
