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
// codeSummaryCache: Outer key = document URI, Inner key = line number
const codeSummaryCache = new Map();
// Function to get the current experience level setting globally
function getExperienceLevel() {
    var _a;
    const config = vscode.workspace.getConfiguration('codeExplainer');
    // Explicitly fetch the global setting
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
async function getCodeSummary(codeToSummarize, fullDocumentContext) {
    var _a;
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error('API key is not set in the environment variables');
    }
    const apiUrl = 'https://api.openai.com/v1/chat/completions';
    const experienceLevel = getExperienceLevel();
    const tokenMaximums = {
        Novice: 200,
        Intermediate: 150,
        Expert: 125
    };
    const token_maximum = (_a = tokenMaximums[experienceLevel]) !== null && _a !== void 0 ? _a : 200;
    try {
        const response = await axios_1.default.post(apiUrl, {
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
                    content: `Put your explanation very non-technical speech for novices. It should be understandable to someone who has never written a line of code.`
                },
                {
                    role: "system",
                    content: `When speaking to intermediate level programmers, feel free to utilize common programming terms, but never use any words that would be considered advanced English.`
                },
                {
                    role: "system",
                    content: `This is the full document that the line of code is in: ${fullDocumentContext}`
                },
                {
                    role: "user",
                    content: `Create a ${token_maximum}-character summary of the following code: ${codeToSummarize}`
                }
            ],
            max_tokens: token_maximum,
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            }
        });
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
    catch (error) {
        console.error('Error fetching code summary:', error.message || error);
        throw new Error('Failed to fetch code summary. Check the logs for details.');
    }
}
function activate(context) {
    // Invalidate cache when the document changes
    const changeListener = vscode.workspace.onDidChangeTextDocument((event) => {
        const docUri = event.document.uri.toString();
        if (codeSummaryCache.has(docUri)) {
            codeSummaryCache.delete(docUri);
            console.log(`Cache invalidated for document: ${docUri}`);
        }
    });
    // Listen for changes to the experience level setting globally
    const configChangeListener = vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('codeExplainer.experienceLevel')) {
            console.log(`Global experience level setting changed to: ${getExperienceLevel()}`);
            // Invalidate the entire cache since summaries depend on the experience level
            codeSummaryCache.clear();
            console.log('Cache cleared due to experience level change.');
        }
    });
    const hoverProvider = vscode.languages.registerHoverProvider({ scheme: 'file', language: '*' }, {
        async provideHover(document, position, _token) {
            const docUri = document.uri.toString();
            const line = position.line;
            const lineText = document.lineAt(line).text;
            const fullDocumentText = document.getText();
            // Check if we have a cache entry for this document
            let docCache = codeSummaryCache.get(docUri);
            if (!docCache) {
                docCache = new Map();
                codeSummaryCache.set(docUri, docCache);
            }
            // Check if a summary for this line is already cached
            if (docCache.has(line)) {
                const cachedSummary = docCache.get(line);
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
            }
            catch (error) {
                console.error('Error in hover provider:', error.message || error);
                return new vscode.Hover('Error generating summary. Please check the logs.');
            }
        },
    });
    context.subscriptions.push(hoverProvider, changeListener, configChangeListener);
}
exports.activate = activate;
function deactivate() {
    // No cleanup required for this extension
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map