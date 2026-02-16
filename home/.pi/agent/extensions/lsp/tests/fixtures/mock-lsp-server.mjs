#!/usr/bin/env node

import { pathToFileURL } from "node:url";

let buffer = Buffer.alloc(0);
let shutdownRequested = false;

const INIT_DELAY_MS = Number.parseInt(process.env.MOCK_LSP_INIT_DELAY_MS || "0", 10);
const REQUEST_DELAY_MS = Number.parseInt(process.env.MOCK_LSP_REQUEST_DELAY_MS || "0", 10);
const DIAG_DELAY_MS = Number.parseInt(process.env.MOCK_LSP_DIAG_DELAY_MS || "20", 10);
const DIAG_SYNC = process.env.MOCK_LSP_DIAG_SYNC === "1";
const HANG_INITIALIZE = process.env.MOCK_LSP_HANG_INITIALIZE === "1";

function send(message) {
  const payload = JSON.stringify(message);
  const header = `Content-Length: ${Buffer.byteLength(payload, "utf8")}\r\n\r\n`;
  process.stdout.write(header + payload);
}

function scheduleDiagnostics(uri) {
  const publish = () => {
    if (shutdownRequested) return;

    send({
      jsonrpc: "2.0",
      method: "textDocument/publishDiagnostics",
      params: {
        uri,
        diagnostics: [
          {
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 5 },
            },
            severity: 2,
            source: "mock-lsp",
            message: "Mock warning",
          },
        ],
      },
    });
  };

  if (DIAG_SYNC) {
    publish();
    return;
  }

  setTimeout(publish, DIAG_DELAY_MS);
}

async function respond(message, resultFactory) {
  if (REQUEST_DELAY_MS > 0) {
    await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS));
  }

  send({
    jsonrpc: "2.0",
    id: message.id,
    result: resultFactory(),
  });
}

async function handleRequest(message) {
  switch (message.method) {
    case "initialize": {
      if (HANG_INITIALIZE) {
        return;
      }

      if (INIT_DELAY_MS > 0) {
        await new Promise((resolve) => setTimeout(resolve, INIT_DELAY_MS));
      }

      send({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          capabilities: {
            definitionProvider: true,
            referencesProvider: true,
            hoverProvider: true,
            implementationProvider: true,
            documentSymbolProvider: true,
            workspaceSymbolProvider: true,
            callHierarchyProvider: true,
          },
        },
      });
      return;
    }

    case "shutdown": {
      shutdownRequested = true;
      send({ jsonrpc: "2.0", id: message.id, result: null });
      return;
    }

    case "textDocument/definition":
    case "textDocument/references":
    case "textDocument/implementation": {
      await respond(message, () => [
        {
          uri: message.params?.textDocument?.uri,
          range: {
            start: { line: 1, character: 2 },
            end: { line: 1, character: 8 },
          },
        },
      ]);
      return;
    }

    case "textDocument/hover": {
      await respond(message, () => ({
        contents: ["Mock hover content"],
        range: {
          start: { line: 1, character: 2 },
          end: { line: 1, character: 8 },
        },
      }));
      return;
    }

    case "textDocument/documentSymbol": {
      await respond(message, () => ([
        {
          name: "mockSymbol",
          kind: 12,
          location: {
            uri: message.params?.textDocument?.uri,
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 10 },
            },
          },
        },
      ]));
      return;
    }

    case "workspace/symbol": {
      const rootUri = message.params?.workspaceFolderUri || pathToFileURL(process.cwd()).href;
      await respond(message, () => ([
        {
          name: `symbol:${message.params?.query || ""}`,
          kind: 12,
          location: {
            uri: rootUri,
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 1 },
            },
          },
        },
      ]));
      return;
    }

    case "textDocument/prepareCallHierarchy": {
      await respond(message, () => ([
        {
          uri: message.params?.textDocument?.uri,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 5 },
          },
          selectionRange: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 5 },
          },
          name: "mockFunction",
          kind: 12,
        },
      ]));
      return;
    }

    case "callHierarchy/incomingCalls":
    case "callHierarchy/outgoingCalls": {
      await respond(message, () => ([
        {
          from: message.params?.item,
          fromRanges: [
            {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 5 },
            },
          ],
        },
      ]));
      return;
    }

    default:
      await respond(message, () => null);
  }
}

function handleNotification(message) {
  if (message.method === "textDocument/didOpen" || message.method === "textDocument/didChange") {
    const uri = message.method === "textDocument/didOpen"
      ? message.params?.textDocument?.uri
      : message.params?.textDocument?.uri;
    if (uri) {
      scheduleDiagnostics(uri);
    }
  }

  if (message.method === "$/cancelRequest") {
    process.stderr.write(`CANCEL:${message.params?.id ?? "unknown"}\n`);
  }

  if (message.method === "exit") {
    process.exit(0);
  }
}

function handleMessage(message) {
  if (Object.prototype.hasOwnProperty.call(message, "id")) {
    void handleRequest(message);
    return;
  }

  handleNotification(message);
}

process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);

  while (true) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd < 0) break;

    const header = buffer.slice(0, headerEnd).toString("utf8");
    const contentLengthMatch = /Content-Length:\s*(\d+)/i.exec(header);
    if (!contentLengthMatch) {
      buffer = Buffer.alloc(0);
      break;
    }

    const contentLength = Number.parseInt(contentLengthMatch[1] || "0", 10);
    const totalLength = headerEnd + 4 + contentLength;
    if (buffer.length < totalLength) break;

    const payload = buffer.slice(headerEnd + 4, totalLength).toString("utf8");
    buffer = buffer.slice(totalLength);

    try {
      const message = JSON.parse(payload);
      handleMessage(message);
    } catch {
      // Ignore malformed payloads.
    }
  }
});
