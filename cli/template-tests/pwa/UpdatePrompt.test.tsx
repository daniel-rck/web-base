import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UpdatePrompt } from "../../lib/pwa/UpdatePrompt.tsx";

const sw = vi.hoisted(() => ({
  needRefresh: false,
  offlineReady: false,
  updateServiceWorker: vi.fn<(reload?: boolean) => Promise<void>>(async () => {}),
}));

vi.mock("virtual:pwa-register/react", () => ({
  useRegisterSW: () => ({
    needRefresh: [sw.needRefresh, vi.fn<(value: boolean) => void>()],
    offlineReady: [sw.offlineReady, vi.fn<(value: boolean) => void>()],
    updateServiceWorker: sw.updateServiceWorker,
  }),
}));

beforeEach(() => {
  sw.needRefresh = false;
  sw.offlineReady = false;
  sw.updateServiceWorker.mockClear();
});

describe("UpdatePrompt", () => {
  it("stays empty until there is something to say, with the status region mounted", () => {
    render(<UpdatePrompt />);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("activates the waiting worker and reloads on „Neu laden“", async () => {
    sw.needRefresh = true;
    render(<UpdatePrompt />);
    expect(screen.getByRole("status")).toHaveTextContent("Update verfügbar");
    await userEvent.click(screen.getByRole("button", { name: "Neu laden" }));
    expect(sw.updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it("says when the app is ready offline", () => {
    sw.offlineReady = true;
    render(<UpdatePrompt />);
    expect(screen.getByRole("status")).toHaveTextContent("offline verfügbar");
  });
});
