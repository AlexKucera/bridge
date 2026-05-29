/* ValidationStatus tests */

import { render, screen, fireEvent } from "@solidjs/testing-library";
import { ValidationStatus } from "../components/ValidationStatus";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

describe("ValidationStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: return a valid report
    mockInvoke.mockResolvedValue({
      checks: [
        { name: "pi_binary", status: "Pass", message: "OK: /usr/local/bin/pi" },
        { name: "skill_path_0", status: "Pass", message: "OK: /skills/default" },
      ],
      overall: "Pass",
    });
  });

  it("renders validation header with title", () => {
    render(() => <ValidationStatus />);
    expect(screen.getByText("Configuration Health")).toBeInTheDocument();
  });

  it("shows refresh button", () => {
    render(() => <ValidationStatus />);
    expect(screen.getByTitle("Re-validate")).toBeInTheDocument();
  });

  it("displays overall status when report is loaded", async () => {
    render(() => <ValidationStatus />);
    await new Promise((r) => setTimeout(r, 20));
    // Target the overall badge specifically (not individual checks)
    const overall = document.querySelector(".validation-overall");
    expect(overall?.textContent).toBe("Pass");
  });

  it("displays individual check results", async () => {
    render(() => <ValidationStatus />);
    await new Promise((r) => setTimeout(r, 20));
    const items = document.querySelectorAll(".validation-check");
    expect(items.length).toBe(2);
  });

  it("shows Fail checks with correct styling", async () => {
    mockInvoke.mockResolvedValue({
      checks: [
        { name: "pi_binary", status: "Fail", message: "Binary not found: /bad/path" },
      ],
      overall: "Fail",
    });
    render(() => <ValidationStatus />);
    await new Promise((r) => setTimeout(r, 20));
    const failItem = document.querySelector(".validation-check--fail");
    expect(failItem).toBeTruthy();
    // Use class-specific selector for overall badge
    const overall = document.querySelector(".validation-overall--fail");
    expect(overall?.textContent).toBe("Fail");
  });

  it("shows Warn checks with correct styling", async () => {
    mockInvoke.mockResolvedValue({
      checks: [
        { name: "pi_binary", status: "Warn", message: "Pi binary path is not set" },
      ],
      overall: "Warn",
    });
    render(() => <ValidationStatus />);
    await new Promise((r) => setTimeout(r, 20));
    const warnItem = document.querySelector(".validation-check--warn");
    expect(warnItem).toBeTruthy();
  });

  it("calls config_validate on mount and refresh click", async () => {
    render(() => <ValidationStatus />);
    await new Promise((r) => setTimeout(r, 20));
    expect(mockInvoke).toHaveBeenCalledWith("config_validate");

    mockInvoke.mockClear();
    const refreshBtn = screen.getByTitle("Re-validate");
    fireEvent.click(refreshBtn);
    await new Promise((r) => setTimeout(r, 10));
    expect(mockInvoke).toHaveBeenCalledWith("config_validate");
  });
});
