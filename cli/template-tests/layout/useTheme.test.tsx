import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { setTheme, useTheme } from "../../lib/ui/useTheme.ts";

function Probe() {
  return <span>{useTheme().resolvedTheme}</span>;
}

afterEach(() => {
  act(() => setTheme("system"));
  localStorage.clear();
});

describe("useTheme", () => {
  it("shares one value between every consumer", () => {
    const a = renderHook(() => useTheme());
    const b = renderHook(() => useTheme());
    act(() => a.result.current.setTheme("dark"));
    expect(b.result.current.theme).toBe("dark");
    expect(b.result.current.resolvedTheme).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("follows another tab through the storage event", () => {
    const { result } = renderHook(() => useTheme());
    localStorage.setItem("theme", "light");
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "theme", newValue: "light" }));
    });
    expect(result.current.theme).toBe("light");
  });

  it("removes data-theme for system", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme("light"));
    act(() => result.current.setTheme("system"));
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("renders without matchMedia", () => {
    const original = window.matchMedia;
    Reflect.deleteProperty(window, "matchMedia");
    try {
      render(<Probe />);
      expect(screen.getByText("light")).toBeInTheDocument();
    } finally {
      window.matchMedia = original;
    }
  });
});
