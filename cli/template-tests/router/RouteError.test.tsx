import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { NotFound } from "../../lib/routing/NotFound.tsx";
import { RouteError } from "../../lib/routing/RouteError.tsx";

function renderAt(path: string, Component: () => never) {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const router = createMemoryRouter(
    [
      {
        path: "/",
        ErrorBoundary: RouteError,
        children: [
          { path: "boom", Component },
          { path: "*", Component: NotFound },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
}

describe("RouteError", () => {
  it("offers a reload when a lazy chunk failed to load", async () => {
    renderAt("/boom", () => {
      throw new TypeError("Failed to fetch dynamically imported module: /assets/Page-abc.js");
    });
    expect(
      await screen.findByRole("heading", { name: "Neue Version verfügbar" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Neu laden" })).toBeInTheDocument();
  });

  it("explains any other error in German", async () => {
    renderAt("/boom", () => {
      throw new Error("kaputt");
    });
    expect(
      await screen.findByRole("heading", { name: "Etwas ist schiefgelaufen" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Zur Startseite" })).toHaveAttribute("href", "/");
  });

  it("renders NotFound for an unknown path", async () => {
    renderAt("/gibt-es-nicht", () => {
      throw new Error("unreachable");
    });
    expect(
      await screen.findByRole("heading", { name: "Seite nicht gefunden" }),
    ).toBeInTheDocument();
    expect(screen.getByText("/gibt-es-nicht")).toBeInTheDocument();
  });
});
