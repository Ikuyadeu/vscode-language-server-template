"use strict";

import {
    CodeAction,
    CodeActionKind,
    createConnection,
    Diagnostic,
    DiagnosticSeverity,
    Range,
    TextDocumentEdit,
    TextDocuments,
    TextDocumentSyncKind,
    TextEdit,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

namespace CommandIDs {
    export const fix = "sample.fix";
}
// Create a connection for the server. The connection uses Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection();
connection.console.info(`Sample server running in node ${process.version}`);
let documents!: TextDocuments<TextDocument>;

connection.onInitialize(() => {
    documents = new TextDocuments(TextDocument);
    setupDocumentsListeners();

    return {
        capabilities: {
            textDocumentSync: {
                openClose: true,
                change: TextDocumentSyncKind.Incremental,
                willSaveWaitUntil: false,
                save: {
                    includeText: false,
                },
            },
            codeActionProvider: {
                codeActionKinds: [CodeActionKind.QuickFix],
            },
            executeCommandProvider: {
                commands: [CommandIDs.fix],
            },
        },
    };
});

/**
 * 大文字に対して警告を表示する
 */
function validate(doc: TextDocument) {
    // The validator creates diagnostics for all uppercase words length 2 and more
    const text = doc.getText();
    const pattern = /\b[A-Z]{2,}\b/g;
    let m: RegExpExecArray | null;

    const diagnostics: Diagnostic[] = [];
    while ((m = pattern.exec(text)) !== null) {
        const range: Range = {start: doc.positionAt(m.index),
                              end: doc.positionAt(m.index + m[0].length),
        };
        const diagnostic: Diagnostic = Diagnostic.create(
            range,
            `${m[0]} is all uppercase.`,
            DiagnosticSeverity.Warning,
            "",
            "sample",
        );
        diagnostics.push(diagnostic);
    }

    // Send the computed diagnostics to VSCode.
    connection.sendDiagnostics({ uri: doc.uri, diagnostics });
}

function setupDocumentsListeners() {
    documents.listen(connection);

    documents.onDidOpen((event) => {
        validate(event.document);
    });

    documents.onDidChangeContent((change) => {
        validate(change.document);
    });

    documents.onDidClose((close) => {
        connection.sendDiagnostics({ uri: close.document.uri, diagnostics: []});
    });

    connection.onCodeAction((params) => {
        const diagnostics = params.context.diagnostics.filter((diag) => diag.source === "sample");
        const textDocument = documents.get(params.textDocument.uri);
        if (textDocument === undefined || diagnostics.length === 0) {
            return [];
        }
        const codeActions: CodeAction[] = [];
        diagnostics.forEach((diag) => {
            const title = "Fix to lower case";
            const originalText = textDocument.getText(diag.range);
            const edits = [TextEdit.replace(diag.range, originalText.toLowerCase())];
            const editPattern = { documentChanges: [
                TextDocumentEdit.create({uri: textDocument.uri,
                                         version: textDocument.version},
                                        edits)] };
            const fixAction = CodeAction.create(title,
                                                editPattern,
                                                CodeActionKind.QuickFix);
            fixAction.diagnostics = [diag];
            codeActions.push(fixAction);
        });

        return codeActions;
    });

}

// Listen on the connection
connection.listen();
