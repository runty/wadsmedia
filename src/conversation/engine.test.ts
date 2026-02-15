import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { conversationLocks, withConversationLock } from "./engine.js";

// ── Helper: create a delayed async function that records execution order ──
function delayed(ms: number, label: string, log: string[]): () => Promise<string> {
  return async () => {
    log.push(`${label}:start`);
    await new Promise((resolve) => setTimeout(resolve, ms));
    log.push(`${label}:end`);
    return label;
  };
}

describe("withConversationLock", () => {
  it("serializes calls with the same key", async () => {
    const log: string[] = [];

    // Fire two calls with the same key concurrently
    const p1 = withConversationLock("user:1", delayed(50, "A", log));
    const p2 = withConversationLock("user:1", delayed(20, "B", log));

    await Promise.all([p1, p2]);

    // A must complete before B starts (sequential)
    expect(log).toEqual(["A:start", "A:end", "B:start", "B:end"]);
  });

  it("allows parallel calls with different keys", async () => {
    const log: string[] = [];

    // Fire two calls with different keys concurrently
    const p1 = withConversationLock("user:1", delayed(50, "A", log));
    const p2 = withConversationLock("user:2", delayed(50, "B", log));

    await Promise.all([p1, p2]);

    // Both should start before either ends (parallel)
    const aStart = log.indexOf("A:start");
    const bStart = log.indexOf("B:start");
    const aEnd = log.indexOf("A:end");
    const bEnd = log.indexOf("B:end");

    // Both started before the other ended
    expect(aStart).toBeLessThan(bEnd);
    expect(bStart).toBeLessThan(aEnd);
  });

  it("continues after error in previous call", async () => {
    const log: string[] = [];

    // First call will reject
    const p1 = withConversationLock("user:err", async () => {
      log.push("A:start");
      throw new Error("boom");
    }).catch(() => {
      log.push("A:caught");
    });

    // Second call should still execute
    const p2 = withConversationLock("user:err", async () => {
      log.push("B:start");
      log.push("B:end");
      return "ok";
    });

    await Promise.all([p1, p2]);

    // A errored, B still ran
    expect(log).toContain("A:start");
    expect(log).toContain("A:caught");
    expect(log).toContain("B:start");
    expect(log).toContain("B:end");

    // B ran after A
    expect(log.indexOf("B:start")).toBeGreaterThan(log.indexOf("A:start"));
  });

  it("returns the value from the callback", async () => {
    const result = await withConversationLock("user:val", async () => 42);
    expect(result).toBe(42);
  });

  it("propagates errors from the callback", async () => {
    await expect(
      withConversationLock("user:throw", async () => {
        throw new Error("test error");
      }),
    ).rejects.toThrow("test error");
  });

  it("cleans up lock map after completion", async () => {
    await withConversationLock("user:cleanup", async () => "done");
    // Allow microtask queue to flush for cleanup
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(conversationLocks.has("user:cleanup")).toBe(false);
  });
});

describe("deferred persistence", () => {
  // Read engine.ts source for structural assertions
  const engineSource = fs.readFileSync(path.resolve(__dirname, "engine.ts"), "utf-8");
  const lines = engineSource.split("\n");

  it("user message is saved after toolCallLoop in engine.ts", () => {
    // Find the line where toolCallLoop is called
    const toolCallLoopLine = lines.findIndex((line) => line.includes("await toolCallLoop("));
    expect(toolCallLoopLine).toBeGreaterThan(-1);

    // Find the line where user message is saved (deferred persistence)
    // Look for saveMessage with role: "user" AFTER the tool call loop section
    const saveUserAfterLoop = lines.findIndex(
      (line, idx) =>
        idx > toolCallLoopLine && line.includes('role: "user"') && line.includes("saveMessage"),
    );
    const saveGroupUserAfterLoop = lines.findIndex(
      (line, idx) =>
        idx > toolCallLoopLine &&
        line.includes('role: "user"') &&
        line.includes("saveGroupMessage"),
    );

    // At least one of the deferred save patterns must appear after toolCallLoop
    const deferredSaveFound =
      saveUserAfterLoop > toolCallLoopLine || saveGroupUserAfterLoop > toolCallLoopLine;
    expect(deferredSaveFound).toBe(true);
  });

  it("catch block does not persist user message", () => {
    // Find the catch block for conversation processing error
    const catchLine = lines.findIndex((line) => line.includes("Conversation processing error"));
    expect(catchLine).toBeGreaterThan(-1);

    // Find the next closing of the catch block (look for the finally or end of catch)
    const finallyLine = lines.findIndex(
      (line, idx) => idx > catchLine && (line.includes("} finally") || line.includes("} catch")),
    );
    const endSearchLine = finallyLine > catchLine ? finallyLine : lines.length;

    // Check that no saveMessage or saveGroupMessage appears in the catch block
    const catchBlock = lines.slice(catchLine, endSearchLine);
    const hasSaveMessage = catchBlock.some(
      (line) =>
        (line.includes("saveMessage") || line.includes("saveGroupMessage")) &&
        line.includes('role: "user"'),
    );

    expect(hasSaveMessage).toBe(false);
  });

  it("comment documents deferred persistence pattern", () => {
    // The code should have a comment explaining why user message is saved after toolCallLoop
    const hasComment = lines.some(
      (line) => line.includes("deferred") && line.toLowerCase().includes("orphan"),
    );
    expect(hasComment).toBe(true);
  });
});
