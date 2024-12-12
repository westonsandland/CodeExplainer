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
async function fetchGPTDefinition(noun) {
    try {
        const response = await axios_1.default.post('https://api.openai.com/v1/chat/completions', {
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "You are a programming assistant providing definitions." },
                { role: "user", content: `Define "${noun}" in a programming context.` }
            ]
        }, {
            headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }
        });
        return response.data.choices[0].message.content.trim();
    }
    catch (error) {
        console.error("Error fetching GPT definition:", error);
        return "Sorry, I couldn't fetch a definition for this term.";
    }
}
exports.fetchGPTDefinition = fetchGPTDefinition;
async function fetchGPTAnswer(noun, question) {
    try {
        const response = await axios_1.default.post('https://api.openai.com/v1/chat/completions', {
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "You are a programming assistant answering questions." },
                { role: "user", content: `We are discussing "${noun}". Question: ${question}` }
            ]
        }, {
            headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }
        });
        return response.data.choices[0].message.content.trim();
    }
    catch (error) {
        console.error("Error fetching GPT response:", error);
        return "Sorry, I couldn't fetch a response.";
    }
}
exports.fetchGPTAnswer = fetchGPTAnswer;
// Generate the HTML content for the webview
function getWebviewContent(noun, initialResponse) {
    return `
        <html>
        <body>
            <h1>Discussion: ${noun}</h1>
            <div id="chat" style="overflow-y: auto; height: 400px;">
                <div><strong>GPT:</strong> ${initialResponse}</div>
            </div>
            <input id="input" type="text" style="width: 90%;" placeholder="Ask a question..." />
            <button onclick="sendMessage()">Send</button>
            <script>
                const vscode = acquireVsCodeApi();

                function sendMessage() {
                    const input = document.getElementById('input');
                    vscode.postMessage({ command: 'askGPT', text: input.value });
                    input.value = '';
                }

                window.addEventListener('message', (event) => {
                    const chat = document.getElementById('chat');
                    const message = event.data.response;
                    chat.innerHTML += '<div><strong>GPT:</strong> ' + message + '</div>';
                });
            </script>
        </body>
        </html>
    `;
}
exports.getWebviewContent = getWebviewContent;
// Open the chat window
async function openChatWindow(term, line, fullDocument) {
    const panel = vscode.window.createWebviewPanel('codeExplainerChat', // Identifier
    `Chat: ${term}`, // Title
    vscode.ViewColumn.Two, // Show on the right side
    { enableScripts: true });
    // Initial GPT response
    const initialResponse = await fetchGPTDefinition(term);
    // HTML content for the webview
    panel.webview.html = getWebviewContent(term, initialResponse);
    // Handle messages from the webview
    panel.webview.onDidReceiveMessage(async (message) => {
        if (message.command === 'askGPT') {
            const question = message.text;
            const response = await fetchGPTAnswer(term, question);
            panel.webview.postMessage({ command: 'gptResponse', response });
        }
    });
    // Log additional details for debugging
    console.log(`Opened chat window for term: ${term}`);
    console.log(`Line of code: ${line}`);
    console.log(`Full document:\n${fullDocument}`);
}
exports.openChatWindow = openChatWindow;
//# sourceMappingURL=deepDive.js.map