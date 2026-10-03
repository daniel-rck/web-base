import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AppShell } from "../../lib/ui/AppShell.tsx";
import { Button } from "../../lib/ui/Button.tsx";
import { PageHeader } from "../../lib/ui/PageHeader.tsx";
import { Spinner } from "../../lib/ui/Spinner.tsx";
import { ThemeToggle } from "../../lib/ui/ThemeToggle.tsx";

function shell() {
  const router = createMemoryRouter([
    {
      path: "/",
      element: (
        <AppShell title="Test-App" navItems={[{ to: "/", label: "Start", icon: <span>·</span> }]}>
          <PageHeader title="Startseite" />
        </AppShell>
      ),
    },
  ]);
  return render(<RouterProvider router={router} />);
}

describe("layout accessibility", () => {
  it("starts with a skip link to the main landmark", async () => {
    shell();
    await userEvent.tab();
    const skip = screen.getByRole("link", { name: "Zum Inhalt springen" });
    expect(skip).toHaveFocus();
    expect(skip).toHaveAttribute("href", "#main");
    expect(screen.getByRole("main")).toHaveAttribute("id", "main");
  });

  it("makes the page title the only h1", () => {
    shell();
    expect(screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent)).toEqual([
      "Startseite",
    ]);
  });

  it("announces the spinner through its status text", () => {
    render(<Spinner label="Lädt Daten" />);
    expect(screen.getByRole("status")).toHaveTextContent("Lädt Daten");
  });

  it("labels the theme toggle with the state and the next action", () => {
    render(<ThemeToggle />);
    expect(screen.getByRole("button")).toHaveAccessibleName("Design: System – wechseln zu Hell");
  });

  it("keeps a disabled button disabled", () => {
    render(
      <Button variant="secondary" disabled>
        Speichern
      </Button>,
    );
    expect(screen.getByRole("button", { name: "Speichern" })).toBeDisabled();
  });
});
