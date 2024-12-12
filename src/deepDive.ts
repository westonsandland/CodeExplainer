import * as vscode from 'vscode';
import axios from 'axios';

//This "deep dive" module allows the user to investigate a specific term in more detail.
//The intent is to also have functionality to explain how it is used in relation to code throughout the codebase.
interface GPTResponse {
    choices: { message: { content: string } }[];
}

export async function fetchGPTDefinition(noun: string): Promise<string> {
    try {
        const response = await axios.post<GPTResponse>('https://api.openai.com/v1/chat/completions', {
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "You are a programming assistant providing definitions." },
                { role: "user", content: `Define "${noun}" in a programming context.` }
            ]
        }, {
            headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }
        });

        return response.data.choices[0].message.content.trim();
    } catch (error) {
        console.error("Error fetching GPT definition:", error);
        return "Sorry, I couldn't fetch a definition for this term.";
    }
}

export async function fetchGPTAnswer(noun: string, question: string): Promise<string> {
    try {
        const response = await axios.post<GPTResponse>('https://api.openai.com/v1/chat/completions', {
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "You are a programming assistant answering questions." },
                { role: "user", content: `We are discussing "${noun}". Question: ${question}` }
            ]
        }, {
            headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }
        });

        return response.data.choices[0].message.content.trim();
    } catch (error) {
        console.error("Error fetching GPT response:", error);
        return "Sorry, I couldn't fetch a response.";
    }
}


// Generate the HTML content for the webview
export function getWebviewContent(noun: string, initialResponse: string): string {
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

// Open the chat window
export async function openChatWindow(term: string, line: string, fullDocument: string) {
    const panel = vscode.window.createWebviewPanel(
        'codeExplainerChat', // Identifier
        `Chat: ${term}`, // Title
        vscode.ViewColumn.Two, // Show on the right side
        { enableScripts: true }
    );

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
