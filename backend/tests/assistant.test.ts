import { test } from "node:test";
import assert from "node:assert/strict";

// The tools module pulls in the Prisma client, whose config insists on these.
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.JWT_ACCESS_SECRET ??= "test_access_secret_for_unit_tests_only";
process.env.JWT_REFRESH_SECRET ??= "test_refresh_secret_for_unit_tests_only";

test("assistant tools: every declared tool is implemented and inputs are validated", async () => {
  const { ASSISTANT_TOOLS, runAssistantTool } = await import("../src/services/assistant.tools");

  for (const tool of ASSISTANT_TOOLS) {
    const result = await runAssistantTool("biz", tool.name, { from: "not-a-date", to: "x", query: "", days: 1 });
    // Bad input (or, for no-input tools, the missing test database) comes
    // back as a tool error the model can read — and never "Unknown tool".
    assert.equal(result.isError, true, tool.name);
    assert.doesNotMatch(result.content, /Unknown tool/, tool.name);
  }

  const unknown = await runAssistantTool("biz", "delete_everything", {});
  assert.deepEqual(unknown, { content: "Unknown tool: delete_everything", isError: true });
});
