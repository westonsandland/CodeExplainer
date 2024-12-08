import * as vscode from 'vscode';
import axios from 'axios';

// codeSummaryCache: Outer key = document URI, Inner key = line number
const codeSummaryCache = new Map<string, Map<number, string>>();

async function getCodeSummary(codeToSummarize: string, fullDocumentContext: string): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error('API key is not set in the environment variables');
    }

    const apiUrl = 'https://api.openai.com/v1/chat/completions';
    const experienceLevel = 'beginner';

    interface OpenAIResponse {
        choices: { message: { content: string } }[];
    }

    try {
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
    // Invalidate cache when the document changes
    const changeListener = vscode.workspace.onDidChangeTextDocument((event) => {
        const docUri = event.document.uri.toString();
        if (codeSummaryCache.has(docUri)) {
            codeSummaryCache.delete(docUri);
            console.log(`Cache invalidated for document: ${docUri}`);
        }
    });

    const hoverProvider = vscode.languages.registerHoverProvider(
        { scheme: 'file', language: '*' },
        {
            async provideHover(document, position, _token) {
                const docUri = document.uri.toString();
                const line = position.line;
                const lineText = document.lineAt(line).text;
                const fullDocumentText = document.getText();

                // Check if we have a cache entry for this document
                let docCache = codeSummaryCache.get(docUri);
                if (!docCache) {
                    docCache = new Map<number, string>();
                    codeSummaryCache.set(docUri, docCache);
                }

                // Check if a summary for this line is already cached
                if (docCache.has(line)) {
                    const cachedSummary = docCache.get(line)!;
                    console.log(`Cache hit for line ${line} in document ${docUri}`);
                    const hoverMessage = new vscode.MarkdownString(cachedSummary);
                    hoverMessage.isTrusted = true;
                    return new vscode.Hover(hoverMessage);
                }

                // No cache hit, we need to fetch from API
                console.log(`Cache miss for line ${line} in document ${docUri}. Calling API...`);
                try {
                    const codeSummary = await getCodeSummary(lineText, fullDocumentText);
                    // Store in cache
                    docCache.set(line, codeSummary);

                    const hoverMessage = new vscode.MarkdownString(codeSummary);
                    hoverMessage.isTrusted = true;
                    return new vscode.Hover(hoverMessage);
                } catch (error) {
                    console.error('Error in hover provider:', (error as any).message || error);
                    return new vscode.Hover('Error generating summary. Please check the logs.');
                }
            },
        }
    );

    context.subscriptions.push(hoverProvider, changeListener);
}

export function deactivate() {
    // No cleanup required for this extension
}
