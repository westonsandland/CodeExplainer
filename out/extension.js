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
async function getCodeSummary(codeToSummarize) {
    const apiKey = 'sk-svcacct-GFm6i_rnLm_IZ1ExRfIyqJk5XNPH6B8SEjOPOY-dnUAIdhT7YBMXaf_zD1-xFvVFngYT3BlbkFJ8UNod-eEq6R8QXeqxZfhJzMY9AlAbs3PwcCpCTOOaQT_KnMfmR9KvDsuIiSdL7qspnwA';
    const apiUrl = 'https://api.openai.com/v1/chat/completions';
    const experienceLevel = 'beginner';
    const response = await axios_1.default.post(apiUrl, {
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
function activate(context) {
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
exports.activate = activate;
function deactivate() {
    // Nothing to clean up currently
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map