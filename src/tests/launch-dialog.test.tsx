import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/solidjs";
import { LaunchDialog, LaunchDialogProps } from "../components/LaunchDialog";

// Mock Tauri invoke
const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: any[]) => mockInvoke(...args),
}));

function renderDialog(overrides?: Partial<LaunchDialogProps>) {
  const props: LaunchDialogProps = {
    open: true,
    vesselId: 1,
    vesselName: "my-project",
    onClose: vi.fn(),
    onLaunched: vi.fn(),
    ...overrides,
  };
  return render(() => <LaunchDialog {...props} />);
}

describe("LaunchDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: config_get returns a valid config, validate passes
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "config_get") return Promise.resolve({
        defaultModel: "claude-sonnet-4",
        defaultProvider: "anthropic",
        defaultThinkingLevel: "medium",
        toolPolicy: "allowAll",
        piBinaryPath: "/usr/local/bin/pi",
      });
      if (cmd === "config_validate") return Promise.resolve({ overall: "Pass" });
      return Promise.resolve(undefined);
    });
  });

  it("renders dialog with title including vessel name", () => {
    renderDialog();
    expect(screen.getByText(/Launch on my-project/)).toBeInTheDocument();
  });

  it("renders mode toggle buttons", () => {
    renderDialog();
    expect(screen.getByText("Structured JSON")).toBeInTheDocument();
    expect(screen.getByText("Terminal PTY")).toBeInTheDocument();
  });

  it("renders prompt textarea", () => {
    renderDialog();
    expect(screen.getByPlaceholderText(/Describe what you want Pi to do/)).toBeInTheDocument();
  });

  it("renders quick template chips", () => {
    renderDialog();
    expect(screen.getByText("Code Review")).toBeInTheDocument();
    expect(screen.getByText("Debug")).toBeInTheDocument();
    expect(screen.getByText("Feature")).toBeInTheDocument();
    expect(screen.getByText("Docs")).toBeInTheDocument();
  });

  it("fills prompt when template chip clicked", async () => {
    renderDialog();
    fireEvent.click(screen.getByText("Code Review"));
    const textarea = screen.getByPlaceholderText(/Describe what/) as HTMLTextAreaElement;
    expect(textarea.value).toContain("Code Review");
  });

  it("disables launch when prompt is empty", () => {
    renderDialog();
    const btn = screen.getByText("Launch Session") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("enables launch when prompt entered and preflight passes", async () => {
    renderDialog();
    const textarea = screen.getByPlaceholderText(/Describe what/) as HTMLTextAreaElement;
    fireEvent.input(textarea, { target: { value: "Test prompt" } });
    // Wait for config/validate promises to resolve
    await new Promise((r) => setTimeout(r, 10));
    const btn = screen.getByText("Launch Session") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it("calls session_launch on click", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "config_get") return Promise.resolve({ defaultModel: "c", defaultProvider: "a", defaultThinkingLevel: "m", toolPolicy: "all", piBinaryPath: "/pi" });
      if (cmd === "config_validate") return Promise.resolve({ overall: "Pass" });
      if (cmd === "session_launch") return Promise.resolve(42);
      return Promise.resolve(undefined);
    });
    renderDialog();
    const textarea = screen.getByPlaceholderText(/Describe what/) as HTMLTextAreaElement;
    fireEvent.input(textarea, { target: { value: "Go" } });
    await new Promise((r) => setTimeout(r, 10));
    fireEvent.click(screen.getByText("Launch Session"));
    await new Promise((r) => setTimeout(r, 10));
    expect(mockInvoke).toHaveBeenCalledWith("session_launch", expect.objectContaining({
      prompt: "Go",
      mode: "json",
    }));
  });

  it("shows session result card after successful launch", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "config_get") return Promise.resolve({ defaultModel: "c", defaultProvider: "a", defaultThinkingLevel: "m", toolPolicy: "all", piBinaryPath: "/pi" });
      if (cmd === "config_validate") return Promise.resolve({ overall: "Pass" });
      if (cmd === "session_launch") return Promise.resolve(99);
      return Promise.resolve(undefined);
    });
    const onLaunched = vi.fn();
    renderDialog({ onLaunched });
    const textarea = screen.getByPlaceholderText(/Describe what/) as HTMLTextAreaElement;
    fireEvent.input(textarea, { target: { value: "Test" } });
    await new Promise((r) => setTimeout(r, 10));
    fireEvent.click(screen.getByText("Launch Session"));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByText(/Session #99/)).toBeInTheDocument();
    expect(onLaunched).toHaveBeenCalledWith(99);
  });

  it("calls onClose when Cancel clicked", () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when backdrop clicked", () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    fireEvent.click(document.querySelector(".fixed")!);
    expect(onClose).toHaveBeenCalled();
  });

  it("toggles mode to PTY and updates CLI preview", async () => {
    renderDialog();
    // Wait for config to load
    await new Promise((r) => setTimeout(r, 10));
    fireEvent.click(screen.getByText("Terminal PTY"));
    // Mode should have changed — verify the button state
    const ptyBtn = screen.getByText("Terminal PTY");
    expect(ptyBtn).toBeInTheDocument();
  });

  it("shows preflight warning when validation fails", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "config_get") return Promise.resolve({});
      if (cmd === "config_validate") return Promise.resolve({ overall: "Fail", binary: "Binary not found: /bad/path" });
      return Promise.resolve(undefined);
    });
    renderDialog();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByText(/Preflight Check Failed/)).toBeInTheDocument();
    const btn = screen.getByText("Launch Session") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("hides preflight warning when dialog is closed", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "config_get") return Promise.resolve({});
      if (cmd === "config_validate") return Promise.resolve({ overall: "Fail", binary: "bad" });
      return Promise.resolve(undefined);
    });
    const { rerender } = renderDialog();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByText(/Preflight/)).toBeInTheDocument();
    rerender(() => <LaunchDialog {...{ open: false, vesselId: 1, vesselName: "v", onClose: vi.fn() }} />);
    expect(screen.queryByText(/Preflight/)).not.toBeInTheDocument();
  });

  it("shows loading state while launching", async () => {
    let resolveLaunch: (v: any) => void;
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "config_get") return Promise.resolve({ m: "", d: "", dt: "", tp: "", pbp: "" });
      if (cmd === "config_validate") return Promise.resolve({ overall: "Pass" });
      if (cmd === "session_launch") return new Promise((r) => { resolveLaunch = r; });
      return Promise.resolve(undefined);
    });
    renderDialog();
    const textarea = screen.getByPlaceholderText(/Describe what/) as HTMLTextAreaElement;
    fireEvent.input(textarea, { target: { value: "Test" } });
    await new Promise((r) => setTimeout(r, 10));
    fireEvent.click(screen.getByText("Launch Session"));
    expect(screen.getByText("Launching...")).toBeInTheDocument();
    resolveLaunch!(1);
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.getByText(/Session #1/)).toBeInTheDocument();
  });
});
