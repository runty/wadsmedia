---
phase: 05-conversation-engine
plan: 02
subsystem: conversation
tags: [openai, zod, tool-calling, json-schema, confirmation-tier]

# Dependency graph
requires:
  - phase: 05-conversation-engine
    plan: 01
    provides: "ChatMessage, ToolDefinition, ToolContext, ToolCallLoopResult, PendingAction types; createLLMClient; conversation history"
provides:
  - "Tool registry with defineTool builder and ToolRegistry class"
  - "Zod-to-JSON-Schema conversion for OpenAI tool definitions"
  - "Tool call loop driving LLM conversation through tool calls to completion"
  - "Destructive action interception with confirmation prompts"
  - "check_status validation tool for end-to-end testing"
affects: [05-conversation-engine, 06-search-tools, 07-library-tools]

# Tech tracking
tech-stack:
  added: []
  patterns: [tool-registry-pattern, tool-call-loop, confirmation-tier-interception, zod-to-json-schema]

key-files:
  created:
    - src/conversation/tools.ts
    - src/conversation/tool-loop.ts
  modified:
    - src/conversation/types.ts

key-decisions:
  - "ToolDefinition.definition narrowed to ChatCompletionFunctionTool (not union ChatCompletionTool) since we only create function tools"
  - "z.toJSONSchema() with draft-7 target used for Zod-to-JSON-Schema conversion (not zodFunction from OpenAI SDK helpers)"
  - "Tool call loop filters to function-type tool calls only, skipping custom tool calls from OpenAI v6 union type"
  - "Zod import in tool-loop.ts is type-only since paramSchema is cast at runtime, not constructed"

patterns-established:
  - "Tool registry: defineTool + ToolRegistry class for registering, looking up, and listing tools"
  - "Confirmation tier interception: destructive tools intercepted before execution, loop exits with pendingConfirmation"
  - "Graceful error recovery: tool errors pushed as tool result messages so LLM can self-correct"

# Metrics
duration: 3min
completed: 2026-02-14
---

# Phase 5 Plan 2: Tool Registry and Tool Call Loop Summary

**Tool registry with Zod-to-JSON-Schema definitions and bounded tool call loop with destructive action confirmation interception**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-14T03:42:56Z
- **Completed:** 2026-02-14T03:46:14Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Built tool registry with `defineTool` helper that converts Zod schemas to JSON Schema via `z.toJSONSchema()` and wraps in OpenAI function tool format
- Created `ToolRegistry` class with register, get, getDefinitions, and isDestructive methods for tool management
- Implemented `toolCallLoop` that drives LLM conversation through tool calls to a final text response, with bounded iterations and five distinct execution paths
- Destructive tool calls are intercepted before execution, returning a pending confirmation with 5-minute expiry
- Registered one `check_status` validation tool to enable end-to-end flow testing without Phase 6/7 dependencies

## Task Commits

Each task was committed atomically:

1. **Task 1: Tool registry with Zod-to-JSON-Schema definitions** - `3127a06` (feat)
2. **Task 2: Tool call loop with confirmation interception** - `d608aeb` (feat)

## Files Created/Modified
- `src/conversation/tools.ts` - Tool registry: defineTool builder, ToolRegistry class, createToolRegistry factory with check_status tool
- `src/conversation/tool-loop.ts` - Tool call loop: LLM chat completions loop with tool execution, confirmation interception, and error recovery
- `src/conversation/types.ts` - Added ChatCompletionFunctionTool export, narrowed ToolDefinition.definition type

## Decisions Made
- Narrowed `ToolDefinition.definition` from `ChatCompletionTool` (union of function + custom) to `ChatCompletionFunctionTool` since we only create function tools -- avoids type narrowing at every access point
- Used `z.toJSONSchema()` with `target: "draft-7"` for schema conversion, avoiding `zodFunction()` from OpenAI SDK helpers which has Zod v4 compatibility concerns
- Tool call loop filters to `toolCall.type === "function"` to handle OpenAI SDK v6's union `ChatCompletionMessageToolCall` type safely
- Zod is imported as type-only in tool-loop.ts since `paramSchema` is already a Zod instance at runtime -- the cast `(tool.paramSchema as z.ZodType)` only needs the type

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Narrowed ChatCompletionTool union type**
- **Found during:** Task 1 (Tool registry)
- **Issue:** OpenAI SDK v6 defines `ChatCompletionTool` as `ChatCompletionFunctionTool | ChatCompletionCustomTool`. Accessing `.function.name` on the union type fails TypeScript type checking.
- **Fix:** Changed `ToolDefinition.definition` type to `ChatCompletionFunctionTool`, added the export from types.ts
- **Files modified:** src/conversation/types.ts, src/conversation/tools.ts
- **Verification:** `npx tsc --noEmit` passes
- **Committed in:** 3127a06 (Task 1 commit)

**2. [Rule 1 - Bug] Narrowed ChatCompletionMessageToolCall union type in loop**
- **Found during:** Task 2 (Tool call loop)
- **Issue:** `ChatCompletionMessageToolCall` is also a union (`ChatCompletionMessageFunctionToolCall | ChatCompletionMessageCustomToolCall`), so accessing `.function` on tool calls fails type checking.
- **Fix:** Added `toolCall.type !== "function"` guard to skip non-function tool calls
- **Files modified:** src/conversation/tool-loop.ts
- **Verification:** `npx tsc --noEmit` passes
- **Committed in:** d608aeb (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs -- OpenAI SDK v6 union type handling)
**Impact on plan:** Both fixes required for TypeScript compilation. No scope creep.

## Issues Encountered

None beyond the type narrowing addressed above.

## User Setup Required

None - no external service configuration required. All dependencies (openai, zod) already installed.

## Next Phase Readiness
- Tool registry framework ready for Phase 6/7 to register search/add/remove tools via `defineTool` and `registry.register()`
- Tool call loop ready for integration into conversation processing pipeline (Plan 05-03)
- check_status tool available for end-to-end flow validation
- Destructive action confirmation pipeline ready for remove tools in Phase 7

## Self-Check: PASSED

All 3 files verified present on disk. Both commit hashes (3127a06, d608aeb) verified in git log.

---
*Phase: 05-conversation-engine*
*Completed: 2026-02-14*
