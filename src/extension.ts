import * as vscode from 'vscode';
import axios from 'axios';

async function getCodeSummary(codeToSummarize: string): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error('API key is not set in the environment variables');
    }
    const apiUrl = 'https://api.openai.com/v1/chat/completions';
    const experienceLevel = 'beginner';
    interface OpenAIResponse {
        choices: { text: string }[];
    }

    const response = await axios.post<OpenAIResponse>(apiUrl, {
        model: "gpt-4o-mini",
        messages: [
            {
                role: "system",
                content: `You are a helpful assistant that summarizes code snippets for ${experienceLevel} programmers.`
            },
            {
                role: "user",
                content: `Create a 100-character summary of the following code: ${codeToSummarize}`
            }
        ],
        max_tokens: 100,
    }, {
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        }
    });

    return response.data.choices[0].text.trim();
}

export function activate(context: vscode.ExtensionContext) {
    // Register a hover provider for all text-based documents
    const hoverProvider = vscode.languages.registerHoverProvider({ scheme: 'file', language: '*' }, {
        async provideHover(document, position, _token) {
            const lineText = document.lineAt(position.line).text;
            console.log('lineText:', lineText);
            const codeSummary = await getCodeSummary(lineText);
            console.log('codeSummary:', codeSummary);
            const hoverMessage = new vscode.MarkdownString(codeSummary);
            
            // MarkdownString defaults to not trusted. For simple text, safe to trust.
            hoverMessage.isTrusted = true;
            return new vscode.Hover(hoverMessage);
        }
    });

    context.subscriptions.push(hoverProvider);
}

export function deactivate() {
    // Nothing to clean up currently
}
