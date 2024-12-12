import * as vscode from 'vscode';
import axios from 'axios';
import { openChatWindow } from './deepDive';

// codeSummaryCache: Outer key = document URI, Inner key = line number
const codeSummaryCache = new Map<string, Map<number, string>>();

// Function to get the current experience level setting globally
function getExperienceLevel(): string {
    const config = vscode.workspace.getConfiguration('codeExplainer');
    const level = config.inspect<string>('experienceLevel')?.globalValue || 'Novice';
    console.log(`Retrieved global experience level: ${level}`);
    return level;
}

// Function to update the experience level globally
// TODO: Use this during the login/authentication period to change the user experience level to what is set in the browser.
// This should be fetched from my personal server for that person's user data.
// async function updateExperienceLevel(newLevel: string): Promise<void> {
//     const config = vscode.workspace.getConfiguration('codeExplainer');
//     try {
//         await config.update('experienceLevel', newLevel, vscode.ConfigurationTarget.Global);
//         console.log(`Updated global experience level to: ${newLevel}`);
//     } catch (error) {
//         console.error('Error updating global experience level:', error);
//     }
// }

// Utility function to build OpenAI API request payload
function buildApiRequestPayload(
    codeToSummarize: string,
    fullDocumentContext: string,
    experienceLevel: string,
    tokenMaximum: number
) {
    return {
        model: "gpt-4o-mini",
        messages: [
            { role: "system", content: `You are a helpful programming assistant that summarizes code snippets for ${experienceLevel} programmers.` },
            { role: "system", content: `Put your explanation in simple, less-technical terms for novices.` },
            { role: "system", content: experienceLevel=="Novice"?
                `Wrap ANY and EVERY noun, verb, and adjectives related to programming in your response with the following HTML tag: <term>...</term>.`:
                `Wrap all technical terms (nouns, verbs, or adjectives) in your response with the following HTML tag: <term>...</term>.` },
            { role: "system", content: `Ensure the response is valid HTML and suitable for rendering in a Markdown popup.` },
            { role: "system", content: `For example: "This function initializes a FenwickTree with specified capacity" should result in "This <term>function</term> <term>initializes</term> a <term>FenwickTree</term> with specified <term>capacity</term>".` },
            { role: "system", content: `Provide your response in plain text using Markdown. Do not wrap your response in backticks or use HTML code blocks.` },
            { role: "user", content: `This is the full document that the line of code is in: ${fullDocumentContext}` },
            { role: "user", content: `Do not explain ANY OTHER lines of code, ONLY the one I tell you to.` },
            { role: "user", content: `Create a ${tokenMaximum}-character summary of the following code: ${codeToSummarize}` }
        ],
        temperature: 0.0,
        top_p: 0.01,
        max_tokens: tokenMaximum,
    };
}

// Function to handle OpenAI API response
function handleApiResponse(response: any): string {
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
}

// Function to fetch code summary from OpenAI API
async function fetchCodeSummaryFromApi(
    codeToSummarize: string,
    fullDocumentContext: string,
    experienceLevel: string,
    tokenMaximum: number
): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error('API key is not set in the environment variables');
    }

    const apiUrl = 'https://api.openai.com/v1/chat/completions';
    const payload = buildApiRequestPayload(codeToSummarize, fullDocumentContext, experienceLevel, tokenMaximum);

    try {
        const response = await axios.post(apiUrl, payload, {
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
        });
        return handleApiResponse(response);
    } catch (error) {
        console.error('Error fetching code summary:', (error as any).message || error);
        throw new Error('Failed to fetch code summary. Check the logs for details.');
    }
}

// Main function to get code summary
async function getCodeSummary(codeToSummarize: string, fullDocumentContext: string): Promise<string> {
    const experienceLevel = getExperienceLevel();
    const tokenMaximums: { [key: string]: number } = { Novice: 125, Intermediate: 100, Expert: 75 };
    let tokenMaximum = tokenMaximums[experienceLevel] ?? 125;
    if (codeToSummarize.length * 6 < tokenMaximum) {
        tokenMaximum = codeToSummarize.length * 6; // Arbitrary number to limit short lines to short explanations.
    }

    return fetchCodeSummaryFromApi(codeToSummarize, fullDocumentContext, experienceLevel, tokenMaximum);
}

// Cache management
function handleCacheInvalidation(event: vscode.TextDocumentChangeEvent) {
    const docUri = event.document.uri.toString();
    if (codeSummaryCache.has(docUri)) {
        codeSummaryCache.delete(docUri);
        console.log(`Cache invalidated for document: ${docUri}`);
    }
}

function handleConfigurationChange(event: vscode.ConfigurationChangeEvent) {
    if (event.affectsConfiguration('codeExplainer.experienceLevel')) {
        console.log(`Global experience level setting changed to: ${getExperienceLevel()}`);
        codeSummaryCache.clear();
        console.log('Cache cleared due to experience level change.');
    }
}

// Hover provider logic
async function provideHoverSummary(
    document: vscode.TextDocument,
    position: vscode.Position
): Promise<vscode.Hover | null> {
    const docUri = document.uri.toString();
    const line = position.line;
    const lineText = document.lineAt(line).text;
    const fullDocumentText = document.getText();

    let docCache = codeSummaryCache.get(docUri);
    if (!docCache) {
        docCache = new Map<number, string>();
        codeSummaryCache.set(docUri, docCache);
    }

    if (docCache.has(line)) {
        const cachedSummary = docCache.get(line)!;
        console.log(`Cache hit for line ${line} in document ${docUri}`);
        const hoverMessage = new vscode.MarkdownString(cachedSummary);
        hoverMessage.isTrusted = true;
        console.log(hoverMessage.value);
        return new vscode.Hover(hoverMessage);
    }

    console.log(`Cache miss for line ${line} in document ${docUri}. Calling API...`);
    try {
        let codeSummary = await getCodeSummary(lineText, fullDocumentText);
        // Post-process to ensure "line" isn't wrapped in <term> tags
        if (codeSummary.includes('<term>line</term>')) {
            codeSummary = codeSummary.replace(/<term>line<\/term>/g, 'line');
        }
        // Transform <term> tags into clickable links
        const enhancedSummary = codeSummary.replace(/<term>(.*?)<\/term>/g, (_, term) => {
            const commandLink = `command:codeExplainer.chatWithGPT?${encodeURIComponent(JSON.stringify({ term }))}`;
            return `[${term}](${commandLink})`;
        });
        // Cache the processed summary
        const formattedSummary = new vscode.MarkdownString(enhancedSummary);
        formattedSummary.isTrusted = true; // Allow trusted Markdown for rendering links
        docCache.set(line, formattedSummary.value);
        console.log(formattedSummary.value);
        return new vscode.Hover(formattedSummary);
    } catch (error) {
        console.error('Error in hover provider:', (error as any).message || error);
        return new vscode.Hover('Error generating summary. Please check the logs.');
    }
}

// Activate function
export function activate(context: vscode.ExtensionContext) {
    const changeListener = vscode.workspace.onDidChangeTextDocument(handleCacheInvalidation);
    const configChangeListener = vscode.workspace.onDidChangeConfiguration(handleConfigurationChange);

    const hoverProvider = vscode.languages.registerHoverProvider(
        { scheme: 'file', language: '*' },
        {
            provideHover(document, position, _token) {
                return provideHoverSummary(document, position);
            },
        }
    );

    context.subscriptions.push(hoverProvider, changeListener, configChangeListener);

    context.subscriptions.push(
        vscode.commands.registerCommand('codeExplainer.chatWithGPT', async (args) => {
            const term = args?.term;
            if (term) {
                await openChatWindow(term);
            }
        })
    );
    
}

export function deactivate() {
    // No cleanup required for this extension
}
