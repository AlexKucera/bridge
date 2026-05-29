/* PiBinaryPicker tests */

import { render, screen, fireEvent } from "@solidjs/testing-library";
import { PiBinaryPicker } from "../components/PiBinaryPicker";

// Mock Tauri invoke
const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

describe("PiBinaryPicker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders text input with placeholder", () => {
    render(() => <PiBinaryPicker value="" onChange={() => {}} />);
    const input = screen.getByPlaceholderText("/usr/local/bin/pi") as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.value).toBe("");
  });

  it("displays the current value in input", () => {
    render(() => <PiBinaryPicker value="/usr/bin/pi" onChange={() => {}} />);
    const input = screen.getByDisplayValue("/usr/bin/pi") as HTMLInputElement;
    expect(input).toBeInTheDocument();
  });

  it("renders Auto-detect button", () => {
    render(() => <PiBinaryPicker value="" onChange={() => {}} />);
    expect(screen.getByText("Auto-detect")).toBeInTheDocument();
  });

  it("calls onChange when input changes", () => {
    let newValue = "";
    render(() => (
      <PiBinaryPicker value="" onChange={(v) => (newValue = v)} />
    ));
    const input = screen.getByPlaceholderText("/usr/local/bin/pi") as HTMLInputElement;

    fireEvent.input(input, { target: { value: "/custom/path" } });
    expect(newValue).toBe("/custom/path");
  });

  it("calls config_detect_binary and updates value on auto-detect", async () => {
    mockInvoke.mockResolvedValue("/usr/local/bin/pi");
    let detectedPath = "";
    render(() => (
      <PiBinaryPicker value="" onChange={(v) => (detectedPath = v)} />
    ));

    const btn = screen.getByText("Auto-detect");
    fireEvent.click(btn);

    // Wait for async resolution
    await new Promise((r) => setTimeout(r, 10));
    expect(mockInvoke).toHaveBeenCalledWith("config_detect_binary");
    expect(detectedPath).toBe("/usr/local/bin/pi");
  });

  it("shows error when auto-detect finds nothing", async () => {
    mockInvoke.mockResolvedValue(null);
    render(() => <PiBinaryPicker value="" onChange={() => {}} />);

    const btn = screen.getByText("Auto-detect");
    fireEvent.click(btn);

    await new Promise((r) => setTimeout(r, 10));
    expect(screen.getByText(/not found/i)).toBeInTheDocument();
  });
});
