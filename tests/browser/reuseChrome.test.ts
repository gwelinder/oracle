import { afterEach, describe, expect, test, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { maybeReuseRunningChromeForTest } from "../../src/browser/index.js";

const noopLogger = () => {};

describe("maybeReuseRunningChrome", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("waits for a shared Chrome port before reusing", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "oracle-chrome-reuse-"));
    const port = 9222;

    void (async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      await fs.writeFile(
        path.join(tmpDir, "DevToolsActivePort"),
        `${port}\n/devtools/browser`,
        "utf8",
      );
    })();

    const probe = vi.fn(async () => ({ ok: true as const }));
    const reusePromise = maybeReuseRunningChromeForTest(tmpDir, noopLogger, {
      waitForPortMs: 1000,
      probe,
    });

    const reused = await reusePromise;
    expect(reused?.port).toBe(port);
    expect(probe).toHaveBeenCalled();

    await fs.rm(tmpDir, { recursive: true, force: true });
  }, 10_000);

  test("returns null immediately when no port and no wait", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "oracle-chrome-reuse-"));
    const probe = vi.fn(async () => ({ ok: true as const }));
    const reused = await maybeReuseRunningChromeForTest(tmpDir, noopLogger, {
      waitForPortMs: 0,
      probe,
      profileInUseProbe: async () => false,
    });
    expect(reused).toBeNull();
    expect(probe).not.toHaveBeenCalled();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("reuses via process scan when DevToolsActivePort file is missing", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "oracle-chrome-reuse-"));
    const probe = vi.fn(async () => ({ ok: true as const }));
    const detectPort = vi.fn(async () => ({ port: 9333, pid: 4242 }));

    const reused = await maybeReuseRunningChromeForTest(tmpDir, noopLogger, {
      waitForPortMs: 0,
      probe,
      detectPort,
      profileInUseProbe: async () => false,
    });

    expect(reused?.port).toBe(9333);
    expect(reused?.pid).toBe(4242);
    expect(detectPort).toHaveBeenCalled();
    expect(probe).toHaveBeenCalledWith({ port: 9333 });

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("throws actionable error when profile is in use but no DevTools port is reachable", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "oracle-chrome-reuse-"));
    const detectPort = vi.fn(async () => null);

    await expect(
      maybeReuseRunningChromeForTest(tmpDir, noopLogger, {
        waitForPortMs: 0,
        detectPort,
        profileInUseProbe: async () => true,
      }),
    ).rejects.toThrow(/manual-login profile/i);

    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});
