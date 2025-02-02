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
function getWebviewContent(term) {
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <!-- Allow the webview to support both light and dark modes -->
            <meta name="color-scheme" content="light dark">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Discussion: ${term}</title>
            <!-- Import Bootstrap for layout and component styling -->
            <link
                href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css"
                rel="stylesheet"
            />
            <style>
                /* Use VS Code's theme colors for overall background and text */
                body {
                    background-color: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                }
                /* Chat container colors */
                .chat-container {
                    background-color: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-editorWidget-border);
                }
                /* Override Bootstrap button colors to match VS Code */
                .btn, .btn-primary {
                    background-color: var(--vscode-button-background) !important;
                    color: var(--vscode-button-foreground) !important;
                    border-color: var(--vscode-button-background) !important;
                }
                /* Override input field colors to match VS Code */
                .form-control {
                    background-color: var(--vscode-editor-background) !important;
                    color: var(--vscode-editor-foreground) !important;
                    border: 1px solid var(--vscode-editorWidget-border) !important;
                }
                /* Override link colors */
                a {
                    color: var(--vscode-textLink-foreground) !important;
                }
                /* Override chat message colors */
                .chat-message.sent {
                    background-color: var(--vscode-button-background) !important;
                    color: var(--vscode-button-foreground) !important;
                }
                .chat-message.received {
                    background-color: var(--vscode-editorWidget-background) !important;
                    color: var(--vscode-editor-foreground) !important;
                }
            </style>
        </head>
        <body>
            <div class="container mt-3">
                <h3 class="text-center">Discussion: ${term}</h3>
                <div id="chat" class="chat-container p-2 mb-3">
                    <div id="messages">
                        <!-- Messages will appear here -->
                    </div>
                </div>
                <div class="input-group">
                    <input
                        id="input"
                        type="text"
                        class="form-control"
                        placeholder="Ask a question..."
                    />
                    <button id="send-button" class="btn btn-primary">Send</button>
                </div>
            </div>
            <script>
                const vscode = acquireVsCodeApi();
                let currentGPTMessage = null;
                let parsingBuffer = "";
                let formattingState = [];

                function escapeHtml(text) {
                    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
                    return text.replace(/[&<>"']/g, (m) => map[m]);
                }

                function applyFormatting(buffer) {
                    let output = "";
                    let i = 0;
                    while (i < buffer.length) {
                        // Bold formatting: toggle on "**"
                        if (buffer.substring(i, i + 2) === "**") {
                            if (formattingState.length && formattingState[formattingState.length - 1] === "bold") {
                                output += "</strong>";
                                formattingState.pop();
                            } else {
                                output += "<strong>";
                                formattingState.push("bold");
                            }
                            i += 2;
                            continue;
                        }
                        // Link formatting: detect [text](url)
                        if (buffer[i] === "[" && !formattingState.includes("link")) {
                            const linkTextEnd = buffer.indexOf("]", i);
                            const linkUrlStart = buffer.indexOf("(", linkTextEnd);
                            const linkUrlEnd = buffer.indexOf(")", linkUrlStart);
                            if (linkTextEnd > -1 && linkUrlStart > -1 && linkUrlEnd > -1) {
                                const text = buffer.substring(i + 1, linkTextEnd);
                                const url = buffer.substring(linkUrlStart + 1, linkUrlEnd);
                                output += \`<a href="\${escapeHtml(url)}" target="_blank">\${escapeHtml(text)}</a>\`;
                                i = linkUrlEnd + 1;
                                continue;
                            }
                        }
                        output += escapeHtml(buffer[i]);
                        i++;
                    }
                    return output;
                }

                function processStreamedChunk(chunk) {
                    parsingBuffer += chunk;
                    const renderedContent = applyFormatting(parsingBuffer);
                    
                    if (!currentGPTMessage) {
                        currentGPTMessage = document.createElement("div");
                        currentGPTMessage.className = "chat-message received p-2 mb-2";
                        currentGPTMessage.innerHTML = "<strong>GPT:</strong> ";
                        document.getElementById("messages").appendChild(currentGPTMessage);
                    }
                    currentGPTMessage.innerHTML = \`<strong>GPT:</strong> \${renderedContent}\`;
                    
                    // Auto-scroll the chat container
                    const chatDiv = document.getElementById("chat");
                    chatDiv.scrollTop = chatDiv.scrollHeight;
                }

                function finishMessage() {
                    currentGPTMessage = null;
                    parsingBuffer = "";
                    formattingState = [];
                }

                window.addEventListener("message", (event) => {
                    if (event.data.command === "gptResponseChunk") {
                        processStreamedChunk(event.data.response);
                    } else if (event.data.command === "gptResponseEnd") {
                        finishMessage();
                    }
                });

                function sendMessage() {
                    const input = document.getElementById("input");
                    const message = input.value.trim();
                    if (message) {
                        addMessage('<strong>You:</strong> ' + message, true);
                        vscode.postMessage({ command: "askGPT", text: message });
                        input.value = "";
                    }
                }

                function addMessage(content, isSent) {
                    const messagesDiv = document.getElementById("messages");
                    const messageDiv = document.createElement("div");
                    messageDiv.className = \`chat-message \${isSent ? "sent" : "received"} p-2 mb-2\`;
                    messageDiv.innerHTML = content;
                    messagesDiv.appendChild(messageDiv);
                    
                    const chatDiv = document.getElementById("chat");
                    chatDiv.scrollTop = chatDiv.scrollHeight;
                }

                document.getElementById("input").addEventListener("keydown", (event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        sendMessage();
                    }
                });

                document.getElementById("send-button").addEventListener("click", sendMessage);
            </script>
        </body>
        </html>
    `;
}
exports.getWebviewContent = getWebviewContent;
async function openChatWindow(term, line, fullDocument) {
    const panel = vscode.window.createWebviewPanel('codeExplainerChat', // Identifier
    `Chat: ${term}`, // Title
    vscode.ViewColumn.Two, // Show on the right side
    { enableScripts: true });
    // Set initial placeholder content
    panel.webview.html = getWebviewContent(term);
    // Fetch the initial GPT response
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
    // Handle subsequent user messages
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