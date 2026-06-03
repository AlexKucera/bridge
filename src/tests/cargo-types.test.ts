import { describe, it, expect } from "vitest";
import {
  changeTypeIcon,
  changeTypeColor,
} from "../lib/cargo-types";

describe("cargo-types helpers", () => {
  describe("changeTypeIcon", () => {
    it('returns "+" for added', () => {
      expect(changeTypeIcon("added")).toBe("+");
    });

    it('returns "~" for modified', () => {
      expect(changeTypeIcon("modified")).toBe("~");
    });

    it('returns "-" for deleted', () => {
      expect(changeTypeIcon("deleted")).toBe("-");
    });

    it('returns "→" for renamed', () => {
      expect(changeTypeIcon("renamed")).toBe("→");
    });
  });

  describe("changeTypeColor", () => {
    it('returns "cargo-green" for added', () => {
      expect(changeTypeColor("added")).toBe("cargo-green");
    });

    it('returns "cargo-amber" for modified', () => {
      expect(changeTypeColor("modified")).toBe("cargo-amber");
    });

    it('returns "cargo-red" for deleted', () => {
      expect(changeTypeColor("deleted")).toBe("cargo-red");
    });

    it('returns "cargo-blue" for renamed', () => {
      expect(changeTypeColor("renamed")).toBe("cargo-blue");
    });
  });
});
