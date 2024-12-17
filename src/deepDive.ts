import * as vscode from 'vscode';
import axios from 'axios';
import { Readable } from 'stream';

//This "deep dive" module allows the user to investigate a specific term in more detail.
//The intent is to also have functionality to explain how it is used in relation to code throughout the codebase.

export async function fetchGPTDefinition(
    term: string,
    line: string,
    fullDocument: string,
    updateCallback: (chunk: string) => void,
    endCallback: () => void
): Promise<void> {
    try {
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: "You are a programming assistant explaining what a specific programming term means." },
                    { role: "user", content: `In 2500 characters or less, define "${term}" in the programming language that it is being used in.` },
                    { role: "user", content: `Also provide a 1000 character summary of what "${term}" is being used for in this line of code: "${line}"` },
                    { role: "user", content: `Lastly, if applicable, provide a 1000 character summary of how "${term}" is being used throughout this document: "${fullDocument}"` },
                    { role: "user", content: `Separate each section with a double line break, but otherwise do not make any indication of division between these outputs.` }
                ],
                stream: true,
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                responseType: 'stream',
            }
        );

        const stream = response.data as Readable;

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
                    } catch (error) {
                        console.error('Error parsing JSON chunk:', error, json);
                    }
                }
            }
        });

        stream.on('end', () => {
            console.log("Stream ended.");
            endCallback();
        });

    } catch (error) {
        console.error("Error fetching GPT response:", error);
        updateCallback("Sorry, I couldn't fetch a response.");
        endCallback();
    }
}


export async function fetchGPTAnswer(
    term: string,
    question: string,
    updateCallback: (chunk: string) => void,
    endCallback: () => void
): Promise<void> {
    try {
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: "You are a programming assistant answering questions." },
                    { role: "user", content: `We are discussing "${term}". Question: ${question}` }
                ],
                stream: true,
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                responseType: 'stream',
            }
        );

        const stream = response.data as Readable;

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
                    } catch (error) {
                        console.error('Error parsing JSON chunk:', error, json);
                    }
                }
            }
        });

        stream.on('end', () => {
            console.log("Stream ended.");
            endCallback();
        });

    } catch (error) {
        console.error("Error fetching GPT response:", error);
        updateCallback("Sorry, I couldn't fetch a response.");
        endCallback();
    }
}

export function getWebviewContent(term: string): string {
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Discussion: ${term}</title>
            <link
                href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css"
                rel="stylesheet"
            />
            <style>
                .chat-container {
                    height: 400px;
                    border: 1px solid #ccc;
                    border-radius: 5px;
                    overflow-y: auto;
                    background-color: #f8f9fa;
                    padding: 10px;
                }
                .chat-message {
                    margin-bottom: 10px;
                    border-radius: 15px;
                    padding: 10px;
                    max-width: 75%;
                }
                .chat-message.sent {
                    background-color: #0d6efd;
                    color: white;
                    margin-left: auto;
                }
                .chat-message.received {
                    background-color: #e9ecef;
                    color: black;
                }
            </style>
        </head>
        <body>
            <div class="container mt-3">
                <h3 class="text-center">Discussion: ${term}</h3>
                <div id="chat" class="chat-container">
                    <div id="messages">
                        <!-- Messages will appear here -->
                    </div>
                </div>
                <div class="mt-3">
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
            </div>
            <script>
                const vscode = acquireVsCodeApi();
                let currentGPTMessage = null;

                // Function to add messages to the chat
                function addMessage(content, isSent) {
                    const messagesDiv = document.getElementById('messages');
                    const messageDiv = document.createElement('div');
                    messageDiv.className = \`chat-message \${isSent ? 'sent' : 'received'}\`;
                    messageDiv.innerHTML = content;
                    messagesDiv.appendChild(messageDiv);

                    // Auto-scroll to bottom
                    const chatDiv = document.getElementById('chat');
                    chatDiv.scrollTop = chatDiv.scrollHeight;
                }

                // Send message to GPT
                function sendMessage() {
                    const input = document.getElementById('input');
                    const message = input.value.trim();
                    if (message) {
                        addMessage('<strong>You:</strong> ' + message, true);
                        vscode.postMessage({ command: 'askGPT', text: message });
                        input.value = '';
                    }
                }

                // Enable "Enter" to send messages
                document.getElementById('input').addEventListener('keydown', (event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        sendMessage();
                    }
                });

                // Send button event listener
                document.getElementById('send-button').addEventListener('click', sendMessage);

                // Handle GPT responses
                window.addEventListener('message', (event) => {
                    const chat = document.getElementById('messages');
                    if (event.data.command === 'gptResponseChunk') {
                        if (!currentGPTMessage) {
                            currentGPTMessage = document.createElement('div');
                            currentGPTMessage.className = 'chat-message received';
                            currentGPTMessage.innerHTML = '<strong>GPT:</strong> ';
                            chat.appendChild(currentGPTMessage);
                        }
                        currentGPTMessage.innerHTML += event.data.response;
                        document.getElementById('chat').scrollTop = document.getElementById('chat').scrollHeight;
                    } else if (event.data.command === 'gptResponseEnd') {
                        currentGPTMessage = null; // Reset for the next message
                        document.getElementById('chat').scrollTop = document.getElementById('chat').scrollHeight;
                    }
                });
            </script>
        </body>
        </html>
    `;
}

export async function openChatWindow(term: string, line: string, fullDocument: string) {
    const panel = vscode.window.createWebviewPanel(
        'codeExplainerChat', // Identifier
        `Chat: ${term}`, // Title
        vscode.ViewColumn.Two, // Show on the right side
        { enableScripts: true }
    );

    // Set initial placeholder content
    panel.webview.html = getWebviewContent(term);

    // Fetch the initial GPT response
    try {
        await fetchGPTDefinition(
            term,
            line,
            fullDocument,
            (chunk) => {
                panel.webview.postMessage({ command: 'gptResponseChunk', response: chunk });
            },
            () => {
                panel.webview.postMessage({ command: 'gptResponseEnd' });
            }
        );
    } catch (error) {
        console.error("Error fetching GPT definition:", error);
        panel.webview.postMessage({ command: 'gptResponseChunk', response: "Sorry, an error occurred while fetching the definition." });
        panel.webview.postMessage({ command: 'gptResponseEnd' });
    }

    // Handle subsequent user messages
    panel.webview.onDidReceiveMessage(async (message) => {
        if (message.command === 'askGPT') {
            const question = message.text;
            try {
                await fetchGPTAnswer(
                    term,
                    question,
                    (chunk) => {
                        panel.webview.postMessage({ command: 'gptResponseChunk', response: chunk });
                    },
                    () => {
                        panel.webview.postMessage({ command: 'gptResponseEnd' });
                    }
                );
            } catch (error) {
                console.error("Error handling user question:", error);
            }
        }
    });
}