# Code Explainer

**Code Explainer** is a Visual Studio Code extension that explains your code. Its primary feature is providing you context for code when you mouse over it.

## Features

- Hover over any line of code to see an explanation of the code popup.

## Setup

1. Clone this repository.
2. Run `npm install` to install dependencies.
3. Run `npm run compile` to build the extension.
4. Press `F5` in VSCode to launch an Extension Development Host.
5. Hover over a line of code in the new host window to see the "Hello World" popup.

## Requirements

- VSCode 1.60.0 or above
- Node.js and npm for development

## License

[MIT](LICENSE)

## Features to be added

- Optimize the activation conditions. This may impact people's IDE performance if we don't activate it at the right time.