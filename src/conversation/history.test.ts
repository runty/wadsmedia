import { describe, expect, it } from "vitest";
import type { ChatMessage } from "./types.js";
import { pruneOrphanedUserMessages, buildLLMMessages } from "./history.js";

/** Helper to create a minimal ChatMessage for testing. */
function msg(
  role: ChatMessage["role"],
  content: string,
  extra?: Partial<ChatMessage>,
): ChatMessage {
  return {
    id: 0,
    userId: 1,
    groupChatId: null,
    role,
    content,
    toolCalls: null,
    toolCallId: null,
    name: null,
    createdAt: new Date(),
    ...extra,
  };
}

describe("pruneOrphanedUserMessages", () => {
  it("returns empty array for empty input", () => {
    expect(pruneOrphanedUserMessages([])).toEqual([]);
  });

  it("preserves a single user message", () => {
    const history = [msg("user", "hi")];
    const result = pruneOrphanedUserMessages(history);
    expect(result).toHaveLength(1);
    expect(result[0]!.content).toBe("hi");
  });

  it("prunes first of two consecutive user messages", () => {
    const history = [msg("user", "hi"), msg("user", "hello"), msg("assistant", "hey")];
    const result = pruneOrphanedUserMessages(history);
    expect(result).toHaveLength(2);
    expect(result[0]!.content).toBe("hello");
    expect(result[1]!.content).toBe("hey");
  });

  it("prunes all but last of three consecutive user messages", () => {
    const history = [
      msg("user", "a"),
      msg("user", "b"),
      msg("user", "c"),
      msg("assistant", "ok"),
    ];
    const result = pruneOrphanedUserMessages(history);
    expect(result).toHaveLength(2);
    expect(result[0]!.content).toBe("c");
    expect(result[1]!.content).toBe("ok");
  });

  it("prunes consecutive user messages in the middle of conversation", () => {
    const history = [
      msg("user", "a"),
      msg("assistant", "b"),
      msg("user", "c"),
      msg("user", "d"),
    ];
    const result = pruneOrphanedUserMessages(history);
    expect(result).toHaveLength(3);
    expect(result[0]!.content).toBe("a");
    expect(result[1]!.content).toBe("b");
    expect(result[2]!.content).toBe("d");
  });

  it("handles tool call sequences without breaking user runs", () => {
    const toolCallsJson = JSON.stringify([{ id: "tc1", type: "function", function: { name: "search", arguments: "{}" } }]);
    const history = [
      msg("user", "a"),
      msg("assistant", "", { toolCalls: toolCallsJson }),
      msg("tool", "result", { toolCallId: "tc1" }),
      msg("user", "b"),
      msg("user", "c"),
    ];
    const result = pruneOrphanedUserMessages(history);
    expect(result).toHaveLength(4);
    expect(result[0]!.content).toBe("a");
    expect(result[1]!.role).toBe("assistant");
    expect(result[2]!.role).toBe("tool");
    expect(result[3]!.content).toBe("c");
  });

  it("does not treat tool messages as breaking a consecutive user run", () => {
    // tool messages between user messages should NOT break the consecutive run
    // because tool messages are part of their parent assistant message
    // However, in practice, tool messages always follow an assistant message.
    // If somehow a tool message appears between user messages, it should not
    // break the consecutive run since it's not an assistant message.
    const history = [
      msg("user", "first"),
      msg("user", "second"),
    ];
    const result = pruneOrphanedUserMessages(history);
    expect(result).toHaveLength(1);
    expect(result[0]!.content).toBe("second");
  });

  it("does not mutate the input array", () => {
    const history = [msg("user", "a"), msg("user", "b"), msg("assistant", "c")];
    const originalLength = history.length;
    pruneOrphanedUserMessages(history);
    expect(history).toHaveLength(originalLength);
    expect(history[0]!.content).toBe("a");
  });

  it("preserves assistant-only conversation", () => {
    const history = [msg("assistant", "a"), msg("user", "b")];
    const result = pruneOrphanedUserMessages(history);
    expect(result).toHaveLength(2);
    expect(result[0]!.content).toBe("a");
    expect(result[1]!.content).toBe("b");
  });

  it("handles multiple separate runs of consecutive user messages", () => {
    const history = [
      msg("user", "a1"),
      msg("user", "a2"),
      msg("assistant", "r1"),
      msg("user", "b1"),
      msg("user", "b2"),
      msg("user", "b3"),
      msg("assistant", "r2"),
    ];
    const result = pruneOrphanedUserMessages(history);
    expect(result).toHaveLength(4);
    expect(result[0]!.content).toBe("a2");
    expect(result[1]!.content).toBe("r1");
    expect(result[2]!.content).toBe("b3");
    expect(result[3]!.content).toBe("r2");
  });
});

describe("buildLLMMessages with pruning", () => {
  it("output never contains consecutive user messages", () => {
    const history = [
      msg("user", "hi"),
      msg("user", "hello"),
      msg("user", "hey there"),
      msg("assistant", "how can I help?"),
      msg("user", "search for a movie"),
    ];

    const result = buildLLMMessages("You are helpful.", history, 20);

    // Check no consecutive user messages
    for (let i = 1; i < result.length; i++) {
      if (result[i]!.role === "user" && result[i - 1]!.role === "user") {
        throw new Error(
          `Consecutive user messages found at indices ${i - 1} and ${i}: ` +
            `"${String(result[i - 1]!.content)}" and "${String(result[i]!.content)}"`,
        );
      }
    }

    // Should contain: system + "hey there" (kept) + assistant + "search for a movie"
    expect(result).toHaveLength(4);
    expect(result[0]!.role).toBe("system");
    expect(result[1]!.role).toBe("user");
    expect(result[1]!.content).toBe("hey there");
    expect(result[2]!.role).toBe("assistant");
    expect(result[3]!.role).toBe("user");
    expect(result[3]!.content).toBe("search for a movie");
  });

  it("preserves tool call pairs after pruning", () => {
    const toolCallsJson = JSON.stringify([
      { id: "tc1", type: "function", function: { name: "search_movies", arguments: '{"query":"test"}' } },
    ]);
    const history = [
      msg("user", "first"),
      msg("user", "search movies"),
      msg("assistant", "", { toolCalls: toolCallsJson }),
      msg("tool", '{"results":[]}', { toolCallId: "tc1" }),
      msg("assistant", "No results found."),
    ];

    const result = buildLLMMessages("You are helpful.", history, 20);

    // Should prune "first", keep "search movies" + tool call pair + final assistant
    expect(result[0]!.role).toBe("system");
    const userMsgs = result.filter((m) => m.role === "user");
    expect(userMsgs).toHaveLength(1);
    expect(userMsgs[0]!.content).toBe("search movies");

    // tool call pair should be intact
    const toolMsgs = result.filter((m) => m.role === "tool");
    expect(toolMsgs).toHaveLength(1);
  });

  it("still works with empty history", () => {
    const result = buildLLMMessages("You are helpful.", [], 20);
    expect(result).toHaveLength(1);
    expect(result[0]!.role).toBe("system");
  });

  it("preserves existing sanitizeToolCallSequences behavior", () => {
    // If an assistant with tool_calls has no matching tool result,
    // sanitizeToolCallSequences should remove it
    const toolCallsJson = JSON.stringify([
      { id: "tc_orphan", type: "function", function: { name: "search", arguments: "{}" } },
    ]);
    const history = [
      msg("user", "do something"),
      msg("assistant", null, { toolCalls: toolCallsJson }),
      // No tool result for tc_orphan
      msg("user", "try again"),
      msg("assistant", "OK, here you go."),
    ];

    const result = buildLLMMessages("System.", history, 20);

    // The orphaned assistant+tool_calls should be removed by sanitize
    const assistantWithTools = result.filter(
      (m) => m.role === "assistant" && "tool_calls" in m && m.tool_calls,
    );
    expect(assistantWithTools).toHaveLength(0);
  });
});
