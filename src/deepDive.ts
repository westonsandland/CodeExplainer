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
        <html>
        <body>
            <h1>Discussion: ${term}</h1>
            <div id="chat" style="overflow-y: auto; height: 400px; border: 1px solid #ddd; padding: 10px;">
                <div id="messages"></div>
            </div>
            <input id="input" type="text" style="width: 90%;" placeholder="Ask a question..." />
            <button id="send-button" onclick="sendMessage()">Send</button>
            <script>
                const vscode = acquireVsCodeApi();
                let currentGPTMessage = null;

                function sendMessage() {
                    const input = document.getElementById('input');
                    const message = input.value.trim();
                    if (message) {
                        const chat = document.getElementById('messages');
                        chat.innerHTML += '<div><strong>You:</strong> ' + message + '</div>';
                        chat.scrollTop = chat.scrollHeight;

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

                window.addEventListener('message', (event) => {
                    const chat = document.getElementById('messages');
                    if (event.data.command === 'gptResponseChunk') {
                        if (!currentGPTMessage) {
                            currentGPTMessage = document.createElement('div');
                            currentGPTMessage.innerHTML = '<strong>GPT:</strong> ';
                            chat.appendChild(currentGPTMessage);
                        }
                        currentGPTMessage.innerHTML += event.data.response;
                        chat.scrollTop = chat.scrollHeight;
                    } else if (event.data.command === 'gptResponseEnd') {
                        currentGPTMessage = null; // Reset for the next message
                        chat.scrollTop = chat.scrollHeight;
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