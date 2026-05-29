/* ThemePicker, AccentPicker, DensityPicker tests */

import { render, screen, fireEvent } from "@solidjs/testing-library";
import { ThemePicker } from "../components/ThemePicker";
import { AccentPicker } from "../components/AccentPicker";
import { DensityPicker } from "../components/DensityPicker";

describe("ThemePicker", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders three theme options: Dark, Light, System", () => {
    render(() => <ThemePicker />);
    expect(screen.getByText("Dark")).toBeInTheDocument();
    expect(screen.getByText("Light")).toBeInTheDocument();
    expect(screen.getByText("System")).toBeInTheDocument();
  });

  it("selects the current theme by default", () => {
    localStorage.setItem("bridge-theme", "light");
    render(() => <ThemePicker />);
    const selected = document.querySelector('button[value="light"][aria-checked="true"]') as HTMLElement;
    expect(selected).toBeTruthy();
  });

  it("calls setTheme when an option is clicked", async () => {
    render(() => <ThemePicker />);
    const lightOption = screen.getByLabelText("Light") as HTMLButtonElement;
    fireEvent.click(lightOption);
    // Should persist to localStorage
    expect(localStorage.getItem("bridge-theme")).toBe("light");
  });
});

describe("AccentPicker", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders five accent swatches", () => {
    render(() => <AccentPicker />);
    const swatches = document.querySelectorAll(".accent-swatch");
    expect(swatches.length).toBe(5);
  });

  it("displays accent labels for each swatch", () => {
    render(() => <AccentPicker />);
    expect(screen.getByText(/Glow/i)).toBeInTheDocument();
    expect(screen.getByText(/Sea green/i)).toBeInTheDocument();
    expect(screen.getByText(/Brass/i)).toBeInTheDocument();
    expect(screen.getByText(/Cargo blue/i)).toBeInTheDocument();
    expect(screen.getByText(/Crew purple/i)).toBeInTheDocument();
  });

  it("selects the stored accent on mount", () => {
    localStorage.setItem("bridge-accent", "sea");
    render(() => <AccentPicker />);
    const selected = document.querySelector('.accent-swatch[data-accent="sea"][aria-checked="true"]');
    expect(selected).toBeTruthy();
  });

  it("persists accent choice on click", () => {
    render(() => <AccentPicker />);
    const seaSwatch = document.querySelector('.accent-swatch[data-accent="sea"]') as HTMLElement;
    fireEvent.click(seaSwatch);
    expect(localStorage.getItem("bridge-accent")).toBe("sea");
  });
});

describe("DensityPicker", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders three density options", () => {
    render(() => <DensityPicker />);
    expect(screen.getByText("Compact")).toBeInTheDocument();
    expect(screen.getByText("Default")).toBeInTheDocument();
    expect(screen.getByText("Comfortable")).toBeInTheDocument();
  });

  it("persists density choice on click", () => {
    render(() => <DensityPicker />);
    const compactOption = screen.getByText("Compact") as HTMLElement;
    fireEvent.click(compactOption);
    expect(localStorage.getItem("bridge-density")).toBe("compact");
  });
});
