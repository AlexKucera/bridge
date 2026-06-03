import { describe, it, expect, vi } from "vitest";
import { createCargoStore } from "../store/cargo-store";
import type { StatusResult, DiffResult, FileDiff } from "../lib/cargo-types";

// Mock @tauri-apps/api/core
const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

describe("cargo-store", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  describe("fetchStatus", () => {
    it("calls cargo_status and updates state", async () => {
      const mockStatus: StatusResult = {
        isClean: false,
        hasConflicts: false,
        mergeInProgress: false,
        branchName: "main",
        files: [
          { path: "src/main.rs", changeType: "modified", staging: "unstaged" },
        ],
      };
      mockInvoke.mockResolvedValue(mockStatus);

      const store = createCargoStore();
      await store.fetchStatus("/fake/repo");

      expect(mockInvoke).toHaveBeenCalledWith("cargo_status", { vesselPath: "/fake/repo" });
      expect(store.status()).toEqual(mockStatus);
      expect(store.error()).toBeNull();
    });

    it("sets error on failure", async () => {
      mockInvoke.mockRejectedValue(new Error("not a git repo"));

      const store = createCargoStore();
      await store.fetchStatus("/bad/path");

      expect(store.error()).toContain("not a git repo");
      expect(store.status()).toBeNull();
    });
  });

  describe("fetchDiff", () => {
    it("calls cargo_diff and updates state", async () => {
      const mockDiff: DiffResult = {
        summary: { added: 1, modified: 0, deleted: 0 },
        files: [
          {
            path: "newfile.ts",
            changeType: "added",
            status: "unstaged",
            additions: 5,
            deletions: 0,
            snippet: "+ content\n",
          },
        ],
      };
      mockInvoke.mockResolvedValue(mockDiff);

      const store = createCargoStore();
      await store.fetchDiff("/fake/repo");

      expect(mockInvoke).toHaveBeenCalledWith("cargo_diff", { vesselPath: "/fake/repo" });
      expect(store.diff()).toEqual(mockDiff);
    });
  });

  describe("selectFile", () => {
    it("sets selectedFilePath to given path", () => {
      const store = createCargoStore();
      store.selectFile("src/App.tsx");
      expect(store.selectedFilePath()).toBe("src/App.tsx");
    });

    it("clears selection when called with null", () => {
      const store = createCargoStore();
      store.selectFile("src/App.tsx");
      store.selectFile(null);
      expect(store.selectedFilePath()).toBeNull();
    });
  });

  describe("setCommitMessage", () => {
    it("updates commit message text", () => {
      const store = createCargoStore();
      store.setCommitMessage("feat: add new feature");
      expect(store.commitMessage()).toBe("feat: add new feature");
    });
  });

  describe("setSail (commit + push)", () => {
    it("calls cargo_commit then cargo_push on success", async () => {
      mockInvoke
        .mockResolvedValueOnce({ hash: "abc1234", timestamp: "2026-06-03T12:00:00Z" })
        .mockResolvedValueOnce({ success: true, message: "Pushed" });

      const store = createCargoStore();
      store.setCommitMessage("test commit");
      await store.setSail("/fake/repo");

      expect(mockInvoke).toHaveBeenCalledWith("cargo_commit", {
        vesselPath: "/fake/repo",
        message: "test commit",
      });
      expect(mockInvoke).toHaveBeenCalledWith("cargo_push", {
        vesselPath: "/fake/repo",
      });
      expect(store.successMessage()).toContain("abc1234");
      expect(store.isCommitting()).toBe(false);
    });

    it("sets error on commit failure", async () => {
      mockInvoke.mockRejectedValue(new Error("nothing to commit"));

      const store = createCargoStore();
      await store.setSail("/fake/repo");

      expect(store.error()).toContain("nothing to commit");
      expect(store.isCommitting()).toBe(false);
    });

    it("sets isCommitting=true during operation", async () => {
      let resolveCommit!: (v: unknown) => void;
      mockInvoke.mockReturnValueOnce(
        new Promise((resolve) => { resolveCommit = resolve; })
      );

      const store = createCargoStore();
      const promise = store.setSail("/fake/repo");

      // Should be committing while promise is pending
      expect(store.isCommitting()).toBe(true);

      resolveCommit({ hash: "def5678", timestamp: "" });
      mockInvoke.mockResolvedValueOnce({ success: true, message: "" });
      await promise;

      expect(store.isCommitting()).toBe(false);
    });
  });

  describe("generateMessage", () => {
    it("calls cargo_generate_message and sets commitMessage", async () => {
      mockInvoke.mockResolvedValue("feat(/tdd): implement auth (auth.rs)");

      const store = createCargoStore();
      await store.generateMessage({
        prompt: "implement user auth",
        filesChanged: ["src/auth.rs"],
        skillInvoked: "tdd",
      });

      expect(mockInvoke).toHaveBeenCalledWith("cargo_generate_message", {
        context: {
          prompt: "implement user auth",
          filesChanged: ["src/auth.rs"],
          skillInvoked: "tdd",
        },
      });
      expect(store.commitMessage()).toBe("feat(/tdd): implement auth (auth.rs)");
    });
  });

  describe("refresh", () => {
    it("fetches both status and diff", async () => {
      mockInvoke
        .mockResolvedValueOnce({ isClean: true, hasConflicts: false, mergeInProgress: false, branchName: "main", files: [] })
        .mockResolvedValueOnce({ summary: { added: 0, modified: 0, deleted: 0 }, files: [] });

      const store = createCargoStore();
      await store.refresh("/fake/repo");

      expect(mockInvoke).toHaveBeenCalledTimes(2);
      expect(store.status()?.isClean).toBe(true);
      expect(store.diff()?.files.length).toBe(0);
    });
  });
});
