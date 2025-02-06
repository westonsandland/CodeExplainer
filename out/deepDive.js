"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openChatWindow = exports.getWebviewContent = exports.fetchGPTAnswer = exports.fetchGPTDefinition = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const axios_1 = __importDefault(require("axios"));
const constants_1 = require("./constants");
//This "deep dive" module allows the user to investigate a specific term in more detail.
//The intent is to also have functionality to explain how it is used in relation to code throughout the codebase.
async function fetchGPTDefinition(term, line, fullDocument, updateCallback, endCallback) {
    try {
        const response = await axios_1.default.post(constants_1.GENAI_BASE_URL, {
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "You are a programming assistant explaining what a specific programming term means." },
                { role: "user", content: `In 2500 characters or less, define "${term}" in the programming language that it is being used in.` },
                { role: "user", content: `Also provide a 1000 character summary of what "${term}" is being used for in this line of code: "${line}"` },
                { role: "user", content: `Lastly, if applicable, provide a 1000 character summary of how "${term}" is being used throughout this document: "${fullDocument}"` },
                { role: "user", content: `Separate each section with a double line break, but otherwise do not make any indication of division between these outputs.` }
            ],
            stream: true,
        }, {
            headers: {
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
            },
            responseType: 'stream',
        });
        const stream = response.data;
        let buffer = '';
        stream.on('data', (chunk) => {
            buffer += chunk.toString('utf8');
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const json = line.slice(6).trim();
                    if (json === '[DONE]') {
                        endCallback();
                        return;
                    }
                    try {
                        const parsed = JSON.parse(json);
                        if (parsed.choices && parsed.choices[0].delta && parsed.choices[0].delta.content) {
                            updateCallback(parsed.choices[0].delta.content);
                        }
                    }
                    catch (error) {
                        console.error('Error parsing JSON chunk:', error, json);
                    }
                }
            }
        });
        stream.on('end', () => {
            console.log("Stream ended.");
            endCallback();
        });
    }
    catch (error) {
        console.error("Error fetching GPT response:", error);
        updateCallback("Sorry, I couldn't fetch a response.");
        endCallback();
    }
}
exports.fetchGPTDefinition = fetchGPTDefinition;
async function fetchGPTAnswer(term, question, updateCallback, endCallback) {
    try {
        const response = await axios_1.default.post(constants_1.GENAI_BASE_URL, {
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "You are a programming assistant answering questions." },
                { role: "user", content: `We are discussing "${term}". Question: ${question}` }
            ],
            stream: true,
        }, {
            headers: {
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
            },
            responseType: 'stream',
        });
        const stream = response.data;
        let buffer = '';
        stream.on('data', (chunk) => {
            buffer += chunk.toString('utf8');
            // Split the buffer into individual `data:` lines
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line in the buffer
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const json = line.slice(6).trim(); // Remove `data: ` prefix
                    if (json === '[DONE]') {
                        endCallback();
                        return;
                    }
                    try {
                        const parsed = JSON.parse(json);
                        if (parsed.choices && parsed.choices[0].delta && parsed.choices[0].delta.content) {
                            updateCallback(parsed.choices[0].delta.content);
                        }
                    }
                    catch (error) {
                        console.error('Error parsing JSON chunk:', error, json);
                    }
                }
            }
        });
        stream.on('end', () => {
            console.log("Stream ended.");
            endCallback();
        });
    }
    catch (error) {
        console.error("Error fetching GPT response:", error);
        updateCallback("Sorry, I couldn't fetch a response.");
        endCallback();
    }
}
exports.fetchGPTAnswer = fetchGPTAnswer;
function getWebviewContent(context, term) {
    const htmlPath = path.join(context.extensionPath, 'src', 'webviewContent.html');
    let html = fs.readFileSync(htmlPath, 'utf8');
    // Replace placeholder(s) with dynamic content.
    html = html.replace(/%TERM%/g, term);
    return html;
}
exports.getWebviewContent = getWebviewContent;
async function openChatWindow(context, term, line, fullDocument) {
    const panel = vscode.window.createWebviewPanel('codeExplainerChat', // Identifier
    `Chat: ${term}`, // Title
    vscode.ViewColumn.Two, // Show on the right side
    { enableScripts: true });
    // Set the webview's HTML content by reading from the separate file.
    panel.webview.html = getWebviewContent(context, term);
    // (Note: you might need to pass the extension context instead of panel.extensionUri.)
    // Fetch the initial GPT response and stream it into the webview.
    try {
        await fetchGPTDefinition(term, line, fullDocument, (chunk) => {
            panel.webview.postMessage({ command: 'gptResponseChunk', response: chunk });
        }, () => {
            panel.webview.postMessage({ command: 'gptResponseEnd' });
        });
    }
    catch (error) {
        console.error("Error fetching GPT definition:", error);
        panel.webview.postMessage({ command: 'gptResponseChunk', response: "Sorry, an error occurred while fetching the definition." });
        panel.webview.postMessage({ command: 'gptResponseEnd' });
    }
    // Handle subsequent user messages.
    panel.webview.onDidReceiveMessage(async (message) => {
        if (message.command === 'askGPT') {
            const question = message.text;
            try {
                await fetchGPTAnswer(term, question, (chunk) => {
                    panel.webview.postMessage({ command: 'gptResponseChunk', response: chunk });
                }, () => {
                    panel.webview.postMessage({ command: 'gptResponseEnd' });
                });
            }
            catch (error) {
                console.error("Error handling user question:", error);
            }
        }
    });
}
exports.openChatWindow = openChatWindow;
//# sourceMappingURL=deepDive.js.map