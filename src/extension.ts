import * as vscode from 'vscode';
import axios from 'axios';

async function getCodeSummary(codeToSummarize: string, fullDocumentContext: string): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error('API key is not set in the environment variables');
    }

    const apiUrl = 'https://api.openai.com/v1/chat/completions';
    const experienceLevel = 'beginner';

    try {
        interface OpenAIResponse {
            choices: { message: { content: string } }[];
        }

        const response = await axios.post<OpenAIResponse>(
            apiUrl,
            {
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: `You are a helpful assistant that summarizes code snippets for ${experienceLevel} programmers.`
                    },
                    {
                        role: "system",
                        content: `You will keep in mind the surrounding context of the code when providing your summary.`
                    },
                    {
                        role: "system",
                        content: `This is the full document that the line of code is in: ${fullDocumentContext}`
                    },
                    {
                        role: "user",
                        content: `Create a 100-character summary of the following code: ${codeToSummarize}`
                    }
                ],
                max_tokens: 100,
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                }
            }
        );

        // Validate response structure
        if (
            response.data &&
            response.data.choices &&
            response.data.choices[0] &&
            response.data.choices[0].message &&
            response.data.choices[0].message.content
        ) {
            return response.data.choices[0].message.content.trim();
        } else {
            throw new Error('Invalid response format from OpenAI API');
        }
    } catch (error) {
        console.error('Error fetching code summary:', (error as any).message || error);
        throw new Error('Failed to fetch code summary. Check the logs for details.');
    }
}

export function activate(context: vscode.ExtensionContext) {
    const hoverProvider = vscode.languages.registerHoverProvider(
        { scheme: 'file', language: '*' },
        {
            async provideHover(document, position, _token) {
                const lineText = document.lineAt(position.line).text;
                console.log(document.getText());
                try {
                    const codeSummary = await getCodeSummary(lineText, document.getText());

                    const hoverMessage = new vscode.MarkdownString(codeSummary);
                    hoverMessage.isTrusted = true; // Safe for simple text
                    return new vscode.Hover(hoverMessage);
                } catch (error) {
                    console.error('Error in hover provider:', (error as any).message || error);
                    return new vscode.Hover('Error generating summary. Please check the logs.');
                }
            },
        }
    );

    context.subscriptions.push(hoverProvider);
}

export function deactivate() {
    // No cleanup required for this extension
}
