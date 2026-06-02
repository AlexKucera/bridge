import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@solidjs/testing-library";
import { SessionActionBar } from "../components/execution/SessionActionBar";

describe("SessionActionBar", () => {
  const defaultProps = {
    onToggleTerminal: vi.fn(),
    isTerminalView: false,
    onExportJson: vi.fn(),
    onExportMarkdown: vi.fn(),
    onSaveFile: vi.fn(),
  };

  it("renders action bar container", () => {
    render(() => <SessionActionBar {...defaultProps} />);
    screen.getByTestId("session-action-bar");
  });

  it("renders Raw Terminal toggle button", () => {
    render(() => <SessionActionBar {...defaultProps} />);
    screen.getByRole("button", { name: /raw terminal/i });
  });

  it("calls onToggleTerminal when terminal toggle is clicked", async () => {
    const onToggle = vi.fn();
    render(() => <SessionActionBar {...defaultProps} onToggleTerminal={onToggle} />);
    fireEvent.click(screen.getByRole("button", { name: /raw terminal/i }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("shows active state when terminal view is enabled", () => {
    render(() => <SessionActionBar {...defaultProps} isTerminalView={true} />);
    const btn = screen.getByRole("button", { name: /raw terminal/i });
    expect(btn.classList.contains("action-btn--active")).toBe(true);
  });

  it("renders Export trigger button", () => {
    render(() => <SessionActionBar {...defaultProps} />);
    screen.getByRole("button", { name: /export/i });
  });

  it("shows export dropdown menu when Export button is clicked", async () => {
    render(() => <SessionActionBar {...defaultProps} />);
    const exportBtn = screen.getByRole("button", { name: /export/i });
    fireEvent.click(exportBtn);
    screen.getByRole("menuitem", { name: /copy json/i });
    screen.getByRole("menuitem", { name: /copy markdown/i });
    screen.getByRole("menuitem", { name: /save to file/i });
  });

  it("calls onExportJson when Copy JSON is clicked", async () => {
    const onExportJson = vi.fn();
    render(() => <SessionActionBar {...defaultProps} onExportJson={onExportJson} />);
    fireEvent.click(screen.getByRole("button", { name: /export/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /copy json/i }));
    expect(onExportJson).toHaveBeenCalledTimes(1);
  });

  it("calls onExportMarkdown when Copy Markdown is clicked", async () => {
    const onExportMd = vi.fn();
    render(() => <SessionActionBar {...defaultProps} onExportMarkdown={onExportMd} />);
    fireEvent.click(screen.getByRole("button", { name: /export/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /copy markdown/i }));
    expect(onExportMd).toHaveBeenCalledTimes(1);
  });

  it("calls onSaveFile when Save to File is clicked", async () => {
    const onSaveFile = vi.fn();
    render(() => <SessionActionBar {...defaultProps} onSaveFile={onSaveFile} />);
    fireEvent.click(screen.getByRole("button", { name: /export/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /save to file/i }));
    expect(onSaveFile).toHaveBeenCalledTimes(1);
  });
});
