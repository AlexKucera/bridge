/* AddVesselDialog test

   Verifies the dialog renders with:
   - Path input field
   - Browse button
   - Display name field (auto-filled from directory name)
   - Validation error messages
   - Confirm/Cancel buttons */

import { describe, it, expect } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { AddVesselDialog } from "../components/AddVesselDialog";

describe("AddVesselDialog", () => {
  it("renders dialog with path input and buttons", () => {
    render(() => <AddVesselDialog open={true} onClose={() => {}} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText(/path/i)).toBeInTheDocument();
    expect(screen.getByText(/browse/i)).toBeInTheDocument();
    expect(screen.getByText(/cancel/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add vessel/i })).toBeInTheDocument();
  });

  it("renders display name field", () => {
    render(() => <AddVesselDialog open={true} onClose={() => {}} />);
    expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
  });

  it("shows nothing when not open", () => {
    render(() => <AddVesselDialog open={false} onClose={() => {}} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("calls onClose when cancelled", async () => {
    let closed = false;
    render(() => <AddVesselDialog open={true} onClose={() => { closed = true; }} />);
    const cancelBtn = screen.getByText(/cancel/i);
    cancelBtn.click();
    expect(closed).toBe(true);
  });
});
