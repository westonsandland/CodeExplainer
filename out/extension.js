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
exports.deactivate = exports.activate = void 0;
const vscode = __importStar(require("vscode"));
const axios_1 = __importDefault(require("axios"));
const deepDive_1 = require("./deepDive");
const constants_1 = require("./constants");
const documentCache_1 = require("./documentCache");
// codeSummaryCache: Outer key = document URI, Inner key = line number
const codeSummaryCache = new Map();
// Function to get the current experience level setting globally
function getExperienceLevel() {
    var _a;
    const config = vscode.workspace.getConfiguration('codeExplainer');
    const level = ((_a = config.inspect('experienceLevel')) === null || _a === void 0 ? void 0 : _a.globalValue) || 'Novice';
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
function buildApiRequestPayload(codeToSummarize, fullDocumentContext, experienceLevel, tokenMaximum) {
    return {
        model: "gpt-4o-mini",
        messages: [
            { role: "system", content: `You are a helpful programming assistant that summarizes code snippets for ${experienceLevel} programmers.` },
            { role: "system", content: `Put your explanation in simple, less-technical terms for novices.` },
            { role: "system", content: experienceLevel == "Novice" ?
                    `Wrap ANY and EVERY noun, verb, and adjectives related to programming in your response with the following HTML tag: <term>...</term>.` :
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
function handleApiResponse(response) {
    if (response.data &&
        response.data.choices &&
        response.data.choices[0] &&
        response.data.choices[0].message &&
        response.data.choices[0].message.content) {
        return response.data.choices[0].message.content.trim();
    }
    else {
        throw new Error('Invalid response format from OpenAI API');
    }
}
// Function to fetch code summary from OpenAI API
async function fetchCodeSummaryFromApi(codeToSummarize, fullDocumentContext, experienceLevel, tokenMaximum) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error('API key is not set in the environment variables');
    }
    const apiUrl = constants_1.GENAI_BASE_URL;
    const payload = buildApiRequestPayload(codeToSummarize, fullDocumentContext, experienceLevel, tokenMaximum);
    try {
        const response = await axios_1.default.post(apiUrl, payload, {
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
        });
        return handleApiResponse(response);
    }
    catch (error) {
        console.error('Error fetching code summary:', error.message || error);
        throw new Error('Failed to fetch code summary. Check the logs for details.');
    }
}
// Main function to get code summary
async function getCodeSummary(codeToSummarize, fullDocumentContext) {
    var _a;
    const experienceLevel = getExperienceLevel();
    const tokenMaximums = { Novice: 125, Intermediate: 100, Expert: 75 };
    let tokenMaximum = (_a = tokenMaximums[experienceLevel]) !== null && _a !== void 0 ? _a : 125;
    if (codeToSummarize.length * 6 < tokenMaximum) {
        tokenMaximum = codeToSummarize.length * 6; // Arbitrary number to limit short lines to short explanations.
    }
    return fetchCodeSummaryFromApi(codeToSummarize, fullDocumentContext, experienceLevel, tokenMaximum);
}
// Cache management
function handleCacheInvalidation(event) {
    const docUri = event.document.uri.toString();
    if (codeSummaryCache.has(docUri)) {
        codeSummaryCache.delete(docUri);
        console.log(`Cache invalidated for document: ${docUri}`);
    }
}
function handleConfigurationChange(event) {
    if (event.affectsConfiguration('codeExplainer.experienceLevel')) {
        console.log(`Global experience level setting changed to: ${getExperienceLevel()}`);
        codeSummaryCache.clear();
        console.log('Cache cleared due to experience level change.');
    }
}
async function provideHoverSummary(document, position) {
    const docUri = document.uri.toString();
    const line = position.line;
    const lineText = document.lineAt(line).text;
    const fullDocumentText = document.getText();
    let docCache = codeSummaryCache.get(docUri);
    if (!docCache) {
        docCache = new Map();
        codeSummaryCache.set(docUri, docCache);
    }
    if (docCache.has(line)) {
        const cachedSummary = docCache.get(line);
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
        // Transform <term> tags into clickable links with clean tooltips
        const enhancedSummary = codeSummary.replace(/<term>(.*?)<\/term>/g, (_, term) => {
            // Instead of including the full document text, generate a key.
            const documentKey = (0, documentCache_1.generateDocumentKey)();
            // Store the full document text in the cache.
            documentCache_1.documentCache.set(documentKey, fullDocumentText);
            // Create the command arguments with the key rather than the full text.
            const commandArgs = JSON.stringify({
                term,
                line: lineText,
                documentKey, // pass the key instead of the full document
            });
            const commandLink = `command:codeExplainer.chatWithGPT?${encodeURIComponent(commandArgs)}`;
            return `[${term}](${commandLink} "Chat with GPT about ${term}")`;
        });
        // Cache the processed summary
        const formattedSummary = new vscode.MarkdownString(enhancedSummary);
        formattedSummary.isTrusted = true; // Allow trusted Markdown for rendering links
        docCache.set(line, formattedSummary.value);
        console.log(formattedSummary.value);
        return new vscode.Hover(formattedSummary);
    }
    catch (error) {
        console.error('Error in hover provider:', error.message || error);
        return new vscode.Hover('Error generating summary. Please check the logs.');
    }
}
function activate(context) {
    const changeListener = vscode.workspace.onDidChangeTextDocument(handleCacheInvalidation);
    const configChangeListener = vscode.workspace.onDidChangeConfiguration(handleConfigurationChange);
    const hoverProvider = vscode.languages.registerHoverProvider({ scheme: 'file', language: '*' }, {
        provideHover(document, position, _token) {
            return provideHoverSummary(document, position);
        },
    });
    context.subscriptions.push(hoverProvider, changeListener, configChangeListener);
    context.subscriptions.push(vscode.commands.registerCommand('codeExplainer.chatWithGPT', async (args) => {
        const term = args === null || args === void 0 ? void 0 : args.term;
        const line = args === null || args === void 0 ? void 0 : args.line;
        const documentKey = args === null || args === void 0 ? void 0 : args.documentKey;
        // Retrieve the full document text from the cache
        const fullDocument = documentCache_1.documentCache.get(documentKey);
        if (term && line && fullDocument) {
            await (0, deepDive_1.openChatWindow)(context, term, line, fullDocument);
        }
        else {
            vscode.window.showErrorMessage("Unable to retrieve document details for deep dive.");
        }
    }));
}
exports.activate = activate;
function deactivate() {
    // No cleanup required for this extension
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map