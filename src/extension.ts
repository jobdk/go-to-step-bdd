import * as vscode from 'vscode';

// TODO: Fix debug log
function shouldShowDebugLogs(): boolean {
    return vscode.workspace.getConfiguration('goToBdd').get<boolean>('showDebugLogs', false);
}

function showDebugInfo(message: string): void {
    console.log(message);
    if (shouldShowDebugLogs()) {
        vscode.window.showInformationMessage(`[Debug] ${message}`);
    }
}

// Regular expressions to match different types of step definitions in Python files
const STEP_DEFINITION_PATTERNS = {
    decoratorPattern: /^\s*@(given|when|then)\s*\(/i,
    functionPattern: /def\s+([a-zA-Z0-9_]+)\s*\(/i
};

// Helper functions for step pattern extraction
/**
 * Extract text between balanced parentheses
 */
function getTextBetweenParentheses(lines: string[], startLineIndex: number, openParenIndex: number): string {
    let fullText = lines[startLineIndex].substring(openParenIndex + 1);
    let openParenCount = 1;
    let currentLine = startLineIndex;

    // Keep going until we find the matching closing parenthesis
    while (openParenCount > 0 && currentLine < lines.length - 1) {
        // Count parentheses in the current line
        for (let i = 0; i < fullText.length; i++) {
            const char = fullText[i];
            if (char === '(') openParenCount++;
            if (char === ')') openParenCount--;

            // If we found the final closing parenthesis, cut the text 
            if (openParenCount === 0) {
                fullText = fullText.substring(0, i);
                break;
            }
        }

        // If we did not find parantheses look at the next line
        if (openParenCount > 0) {
            currentLine++;
            if (currentLine < lines.length) {
                fullText += ' ' + lines[currentLine].trim();
            } else {
                break; // No more lines to process
            }
        }
    }

    return openParenCount === 0 ? fullText : '';
}

/**
 * Extract the first quoted string from text
 */
function extractQuotedString(text: string): string {
    // Try double quotes first
    const doubleQuoteMatch = text.match(/"([^"\\]*(?:\\.[^"\\]*)*)"/);
    if (doubleQuoteMatch) {
        return doubleQuoteMatch[1];
    }

    // Try single quotes if double quotes didn't match
    const singleQuoteMatch = text.match(/'([^'\\]*(?:\\.[^'\\]*)*)'/);
    if (singleQuoteMatch) {
        return singleQuoteMatch[1];
    }

    return '';
}

/**
 * Clean up parse() function patterns
 */
function makeParsePatternMatchable(pattern: string): string {
    // Replace escaped quotes with regular quotes
    let cleaned = pattern.replace(/\\"/g, '"').replace(/\\'/g, "'");

    // Handle escaped braces
    cleaned = cleaned.replace(/\\{/g, '{').replace(/\\}/g, '}');

    return cleaned;
}

// Regex to match step usages in feature files
const CUCUMBER_STEP_START_PATTERN = /^\s*(Given|When|Then|And|But)\s+(.+)$/i;

interface StepDefinition {
    type: string;        // given, when, or then
    pattern: string;     // The step text
    filePath: string;    // File path
    lineNumber: number;  // Line number
    functionName: string; // Function name
    matchQuality?: number; // Match quality
}

async function findAllStepDefinitions(): Promise<StepDefinition[]> {
    const stepDefinitions: StepDefinition[] = [];

    // Only search in the tests/steps/ directories
    // TODO: Make this configurable
    const pythonFiles = await vscode.workspace.findFiles('**/tests/**/steps/**/*.py');

    // If no files are found, try with just steps/ directories
    if (pythonFiles.length === 0) {
        const morePythonFiles = await vscode.workspace.findFiles('**/steps/**/*.py');
        pythonFiles.push(...morePythonFiles);
    }

    showDebugInfo(`Found ${pythonFiles.length} Python files to search for step definitions`);

    // Process each Python file to find step definitions
    for (const file of pythonFiles) {
        showDebugInfo(`Searching for step definitions in ${file.fsPath}`);

        const document = await vscode.workspace.openTextDocument(file);
        const text = document.getText();
        const lines = text.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // Check if this line contains a step decorator
            const decoratorMatch = line.match(STEP_DEFINITION_PATTERNS.decoratorPattern);

            if (decoratorMatch) {
                const stepType = decoratorMatch[1].toLowerCase(); // given, when, or then
                showDebugInfo(`Found ${stepType} decorator at line ${i}: ${line}`);

                // Extract the step pattern
                let stepPattern = '';

                // Get the full decorator text including parentheses
                const fullDecoratorText = getTextBetweenParentheses(lines, i, line.indexOf('('));
                if (!fullDecoratorText) {
                    showDebugInfo(`⚠️ Could not extract balanced parentheses text from decorator at line ${i}`);
                    continue; // Skip this decorator if we can't extract the text
                }

                // Extract the step pattern from the decorator text

                // First try standard quoted string
                stepPattern = extractQuotedString(fullDecoratorText);

                // If normal pattern is found, is it within parse(?
                if (stepPattern) {
                    showDebugInfo(`Extracted standard pattern: "${stepPattern}"`);

                    // Check if this is a parse() function pattern
                    if (fullDecoratorText.includes('parse(')) {
                        // Clean up escaped characters in parse patterns
                        stepPattern = makeParsePatternMatchable(stepPattern);
                        showDebugInfo(`Cleaned parse pattern: "${stepPattern}"`);
                    }
                } else {
                    showDebugInfo(`⚠️ Could not extract step pattern from decorator text: ${fullDecoratorText}`);
                    continue;
                }

                if (!stepPattern) {
                    showDebugInfo(`⚠️ Could not extract step pattern from decorator at line ${i}`);
                    continue;
                }

                // Find the function definition that follows the decorator
                let functionName = '';
                let functionLine = -1;

                // Look ahead for the function name (def statement)
                for (let j = i + 1; j < lines.length && j < i + 20; j++) {
                    const potentialFuncLine = lines[j].trim();

                    // Skip blank lines and comments
                    if (potentialFuncLine === '' || potentialFuncLine.startsWith('#') ||
                        potentialFuncLine.startsWith('"""') || potentialFuncLine.startsWith("'''")) {
                        continue;
                    }

                    // Check if this is a function definition
                    const funcMatch = potentialFuncLine.match(STEP_DEFINITION_PATTERNS.functionPattern);
                    if (funcMatch) {
                        functionName = funcMatch[1];
                        functionLine = j;
                        showDebugInfo(`Found function: ${functionName} at line ${j}`);
                        break;
                    }
                }

                if (functionName && functionLine >= 0) {
                    stepDefinitions.push({
                        type: stepType,
                        pattern: stepPattern,
                        filePath: file.fsPath,
                        lineNumber: functionLine,
                        functionName
                    });
                    showDebugInfo(`Added step definition: ${stepType} "${stepPattern}" => ${functionName} at line ${functionLine}`);
                }
            }
        }
    }

    console.log(`Found ${stepDefinitions.length} total step definitions`);
    return stepDefinitions;
}

/**
 * Find matching step definition for a given feature step.
 */
function findMatchingStepDefinition(
    stepText: string,
    stepType: string,
    stepDefinitions: StepDefinition[]
): StepDefinition | undefined {
    // Normalize the step type
    const normalizedType = normalizeStepType(stepType);

    showDebugInfo(`Looking for step match: "${stepText}" (type: ${normalizedType})`);

    const possibleMatches: StepDefinition[] = [];

    for (const def of stepDefinitions) {
        // Skip if step types don't match (except for 'and' and 'but' which can match any type)
        if (normalizedType !== 'and' && normalizedType !== 'but' && def.type !== normalizedType) {
            continue;
        }

        const stepPattern = def.pattern;

        // 1. Exact match (case insensitive)
        if (stepText.toLowerCase() === stepPattern.toLowerCase()) {
            showDebugInfo(`✅ EXACT MATCH: ${def.functionName}`);
            possibleMatches.push({...def, matchQuality: 5});
            continue;
        }

        // 2. Pattern match (using regex)
        try {
            const regexPattern = convertStepPatternToRegex(stepPattern);
            const regex = new RegExp(`^${regexPattern}$`, 'i');

            if (regex.test(stepText)) {
                showDebugInfo(`✅ PATTERN MATCH: ${def.functionName}`);
                possibleMatches.push({...def, matchQuality: 4});
                continue;
            }
        } catch (error) {
            console.error(`Invalid regex pattern for "${stepPattern}":`, error);
        }

        // 3. Word similarity match
        const similarity = calculateSimilarity(stepText, stepPattern);
        if (similarity >= 0.8) {
            showDebugInfo(`✅ SIMILARITY MATCH (${Math.round(similarity * 100)}%): ${def.functionName}`);
            possibleMatches.push({...def, matchQuality: similarity * 3});
        }
    }

    if (possibleMatches.length === 0) {
        showDebugInfo(`❌ No matching step definition found`);
        return undefined;
    }

    // Sort by match quality
    possibleMatches.sort((a, b) => {
        // Sort by step type
        const typeMatchA = a.type === normalizedType ? 1 : 0;
        const typeMatchB = b.type === normalizedType ? 1 : 0;
        if (typeMatchB !== typeMatchA) {
            return typeMatchB - typeMatchA;
        }

        // Then by the match quality
        return (b.matchQuality || 0) - (a.matchQuality || 0);
    });

    showDebugInfo(`Found ${possibleMatches.length} matches, using best match: ${possibleMatches[0].functionName}`);
    return possibleMatches[0];
}

/**
 * Convert step pattern with {param} placeholders to regex
 */
function convertStepPatternToRegex(pattern: string): string {
    showDebugInfo(`Original pattern: "${pattern}"`);

    // Escape regex special characters except for { and }
    let regexPattern = pattern.replace(/[.*+?^$()|\[\]\\]/g, '\\$&');

    // Handle quoted parameters - convert "{param}" to a quoted value regex
    regexPattern = regexPattern
        .replace(/"({[^}:]+(?::[^}]+)?})"/g, '"([^"]*)"')
        .replace(/'({[^}:]+(?::[^}]+)?})'/g, "'([^']*)'");

    // Replace remaining {param} patterns with a regex group
    regexPattern = regexPattern
        .replace(/{([^}:]+)(?::[^}]+)?}/g, '([\\w\\._\\-A-Za-z0-9]+)');

    // Make whitespace more flexible
    regexPattern = regexPattern.replace(/\s+/g, '\\s+');

    showDebugInfo(`Converted regex pattern: "${regexPattern}"`);
    return regexPattern;
}

/**
 * Calculate similarity between step text and pattern
 * Returns a score between 0 and 1
 */
function calculateSimilarity(stepText: string, stepPattern: string): number {
    // Normalize both strings - lowercase and remove extra whitespace
    const normalizedText = stepText.toLowerCase().trim();
    const normalizedPattern = stepPattern.toLowerCase().trim();

    // Split into tokens (words)
    const textTokens = normalizedText.split(/\s+/);

    // Replace parameter placeholders with a wildcard for matching
    const processedPattern = normalizedPattern.replace(/{[^}]+}/g, '.*');
    const patternTokens = processedPattern.split(/\s+/);

    // Count how many pattern tokens match text tokens
    let matchCount = 0;
    let textPos = 0;

    for (const patternToken of patternTokens) {
        if (patternToken === '.*') {
            // Parameter placeholder - always counts as match if we have text left
            if (textPos < textTokens.length) {
                matchCount++;
                textPos++;
            }
        } else {
            // Regular word - must match exactly or be a substring
            if (textPos < textTokens.length &&
                (textTokens[textPos] === patternToken ||
                    textTokens[textPos].includes(patternToken) ||
                    patternToken.includes(textTokens[textPos]))) {
                matchCount++;
            }
            textPos++;
        }
    }

    // Calculate similarity - number of matches divided by max token count
    const maxTokens = Math.max(patternTokens.length, textTokens.length);
    return maxTokens > 0 ? matchCount / maxTokens : 0;
}

/**
 * Normalize step type (convert And/But to the appropriate type based on context)
 */
function normalizeStepType(stepType: string): string {
    stepType = stepType.toLowerCase();

    // And/But steps can match with any step type
    if (stepType === 'and' || stepType === 'but') {
        return 'and';
    }

    // Ensure step types are normalized to exactly 'given', 'when', or 'then'
    if (stepType === 'given' || stepType === 'when' || stepType === 'then') {
        return stepType;
    }

    console.log(`WARNING: Unknown step type "${stepType}", defaulting to "given"`);
    showDebugInfo(`WARNING: Unknown step type "${stepType}", defaulting to "given"`);
    return 'given'; // Default
}

/**
 * Navigate to the step definition
 */
/**
 * Navigate to the step definition
 * Called when:
 * - User executes "Go to BDD Step Definition" command
 * - User clicks CodeLens link
 * - User presses Cmd+B (Mac) or Ctrl+B (Windows/Linux) on a step line
 */
async function navigateToStepDefinition(editor: vscode.TextEditor) {
    const document = editor.document;

    // Only process feature files
    if (!document.fileName.endsWith('.feature')) {
        vscode.window.showInformationMessage('This command only works in .feature files');
        return;
    }

    // Get the current line text
    const lineNumber = editor.selection.active.line;
    const lineText = document.lineAt(lineNumber).text;

    // Check if the line contains a step
    const stepMatch = lineText.match(CUCUMBER_STEP_START_PATTERN);
    if (!stepMatch) {
        vscode.window.showInformationMessage('No step found at the current line');
        return;
    }

    // Extract the type of step (Given/When/Then/And/But) from the matched group and convert to lowercase
    const stepType = stepMatch[1].toLowerCase();
    // Extract the actual step text/description from the matched group
    const stepText = stepMatch[2];

    vscode.window.showInformationMessage(`Looking for step: ${stepText}`);

    // Find all step definitions
    // TODO: Caching?
    const stepDefinitions = await findAllStepDefinitions();
    showDebugInfo(`Found ${stepDefinitions.length} step definitions`);

    // Debugging
    stepDefinitions.forEach((def, index) => {
        showDebugInfo(`Step definition ${index + 1}: ${def.type} - "${def.pattern}" - ${def.functionName}`);
    });

    // Find matching step definition
    const matchingDef = findMatchingStepDefinition(stepText, stepType, stepDefinitions);

    if (matchingDef) {
        showDebugInfo(`----- FOUND MATCHING STEP DEFINITION -----`);
        showDebugInfo(`Type: ${matchingDef.type}`);
        showDebugInfo(`Pattern: ${matchingDef.pattern}`);
        showDebugInfo(`Function: ${matchingDef.functionName}`);
        showDebugInfo(`File: ${matchingDef.filePath}`);
        showDebugInfo(`Line Number: ${matchingDef.lineNumber}`);

        // Open the file and navigate to the step definition
        const document = await vscode.workspace.openTextDocument(matchingDef.filePath);
        const editor = await vscode.window.showTextDocument(document);

        // Get the actual line number in the original document
        const defLine = matchingDef.lineNumber;

        // Get the function definition line
        let actualLineNumber = defLine;

        // Check to ensure we're at the right line
        const lineText = document.lineAt(actualLineNumber).text;
        if (!lineText.includes(`def ${matchingDef.functionName}`)) {
            showDebugInfo(`Line ${actualLineNumber} does not contain the expected function definition: ${matchingDef.functionName}`);
            showDebugInfo(`Line text: ${lineText}`);

            // Scan the document for the correct function definition
            let foundFunction = false;
            for (let i = 0; i < document.lineCount; i++) {
                const text = document.lineAt(i).text;
                if (text.includes(`def ${matchingDef.functionName}(`)) {
                    actualLineNumber = i;
                    foundFunction = true;
                    showDebugInfo(`Found correct function at line ${i}: ${text}`);
                    break;
                }
            }

            if (!foundFunction) {
                // Fallback to a broader search
                for (let i = 0; i < document.lineCount; i++) {
                    const text = document.lineAt(i).text;
                    if (text.includes(`def ${matchingDef.functionName}`)) {
                        actualLineNumber = i;
                        showDebugInfo(`Found approximate function match at line ${i}: ${text}`);
                        break;
                    }
                }
            }
        }

        // Position at the step definition function
        const position = new vscode.Position(actualLineNumber, 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(
            new vscode.Range(position, position),
            vscode.TextEditorRevealType.InCenter
        );

        vscode.window.showInformationMessage(`Navigated to step implementation: ${matchingDef.functionName}`);
    } else {
        // Add more detailed error information when debug logs are enabled
        if (shouldShowDebugLogs()) {
            vscode.window.showWarningMessage(`No matching step definition found for: "${stepText}"\nLooked for step type: ${stepType}\nChecked ${stepDefinitions.length} step definitions`);
        } else {
            vscode.window.showWarningMessage(`No matching step definition found for: "${stepText}"`);
        }
    }
}

// Start of the extension. Triggered when the extension is activated.
export function activate(context: vscode.ExtensionContext) {
    console.log('Extension "go-to-step-bdd" is now active');

    // Register command to navigate from feature to step definition
    const goToStepCommand = vscode.commands.registerTextEditorCommand(
        'go-to-step-bdd.goToStepDefinition',
        navigateToStepDefinition
    );

    // Add code lens provider for feature files
    const codeLensProvider = new FeatureFileCodeLensProvider();
    const codeLensRegistration = vscode.languages.registerCodeLensProvider(
        {language: 'feature', scheme: 'file'},
        codeLensProvider
    );

// Subscribe to the goToStep command and codeLens features so they can be disposed when extension deactivates
    context.subscriptions.push(goToStepCommand, codeLensRegistration);
}

/**
 * Code lens provider for feature files
 */
class FeatureFileCodeLensProvider implements vscode.CodeLensProvider {
    async provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.CodeLens[]> {
        // Only process feature files
        if (!document.fileName.endsWith('.feature')) {
            return [];
        }

        // Find all step definitions
        // TODO: Caching?
        const stepDefinitions = await findAllStepDefinitions();

        const codeLenses: vscode.CodeLens[] = [];

        // Process each line in the document
        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i);
            const match = line.text.match(CUCUMBER_STEP_START_PATTERN);

            if (match) {
                const stepType = match[1].toLowerCase();
                const stepText = match[2];

                // Find matching step definition
                const matchingDef = findMatchingStepDefinition(
                    stepText,
                    stepType,
                    stepDefinitions
                );

                if (matchingDef) {
                    // Create a code lens for this step
                    const range = new vscode.Range(i, 0, i, line.text.length);
                    const lens = new vscode.CodeLens(range, {
                        title: `➡️ Go to step: ${matchingDef.functionName}`,
                        command: 'editor.action.goToLocations',
                        arguments: [
                            document.uri,
                            new vscode.Position(i, 0),
                            [new vscode.Location(vscode.Uri.file(matchingDef.filePath), new vscode.Position(matchingDef.lineNumber, 0))],
                            'goto',
                            'Step Definition'
                        ]
                    });

                    codeLenses.push(lens);
                }
            }
        }

        return codeLenses;
    }
}
/**
 * Deactivate the extension
 * This function is called when the extension is deactivated.
 */
export function deactivate() {
}
