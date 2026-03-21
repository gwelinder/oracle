import { describe, expect, it } from "vitest";
import { buildAgentModeExpressionForTest } from "../../src/browser/actions/agentMode.js";

describe("browser agent-mode expression", () => {
  it("uses tools button selectors and menu traversal", () => {
    const expression = buildAgentModeExpressionForTest("on");
    expect(expression).toContain("composer-plus-btn");
    expect(expression).toContain("MENU_CONTAINER_SELECTOR");
    expect(expression).toContain("MENU_ITEM_SELECTOR");
    expect(expression).toContain('role="menuitemcheckbox"');
    expect(expression).toContain('role="menuitemradio"');
    expect(expression).toContain("openAnySubmenu");
    expect(expression).toContain("matchesAgent");
    expect(expression).toContain("agent mode");
  });

  it("embeds the requested target mode", () => {
    expect(buildAgentModeExpressionForTest("on")).toContain('"on"');
    expect(buildAgentModeExpressionForTest("off")).toContain('"off"');
  });
});
