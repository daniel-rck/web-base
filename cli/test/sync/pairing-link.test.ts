import { afterEach, describe, expect, it, vi } from "vitest";
import {
  consumePairingFragment,
  formatPairingCode,
  pairingUrl,
  readPairingCode,
  type PairingWindow,
} from "../../templates/sync/client/pairing.ts";

const CODE = "080020G30G2GC1R81450P30D1R7WVC8";

function fakeWindow(url: string) {
  const { hash, pathname, search } = new URL(url);
  const state = { usr: null, key: "abc", idx: 3 };
  const replaceState = vi.fn<History["replaceState"]>();
  const win: PairingWindow = {
    location: { hash, pathname, search },
    history: { state, replaceState },
  };
  return { win, state, replaceState };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pairingUrl", () => {
  it("puts the code in the fragment only", () => {
    const url = new URL(pairingUrl(formatPairingCode(CODE), "https://app.test/start?x=1"));
    expect(url.hash).toBe(`#sync=${CODE}`);
    expect(`${url.origin}${url.pathname}${url.search}`).toBe("https://app.test/start?x=1");
  });

  it("defaults to the current page without query or hash", () => {
    expect(pairingUrl(CODE)).toBe(`#sync=${CODE}`);
    vi.stubGlobal("location", { origin: "https://app.test", pathname: "/app/" });
    expect(pairingUrl(CODE)).toBe(`https://app.test/app/#sync=${CODE}`);
  });
});

describe("readPairingCode", () => {
  it("reads #sync= and HashRouter's #/route?sync=", () => {
    expect(readPairingCode(`#sync=${CODE}`)).toBe(CODE);
    expect(readPairingCode(`#a=1&sync=${CODE}`)).toBe(CODE);
    expect(readPairingCode(`#/import?sync=${CODE}`)).toBe(CODE);
    expect(readPairingCode(`#/x?a=1&sync=${CODE}`)).toBe(CODE);
  });

  it("returns null without a code", () => {
    for (const hash of ["", "#", "#/route", "#/route?a=1", "#section-2", "#sync="]) {
      expect(readPairingCode(hash)).toBeNull();
    }
  });
});

describe("consumePairingFragment", () => {
  it("returns the code and strips it, keeping history.state", () => {
    const { win, state, replaceState } = fakeWindow(`https://app.test/app?x=1#sync=${CODE}`);
    expect(consumePairingFragment(win)).toBe(CODE);
    expect(replaceState).toHaveBeenCalledExactlyOnceWith(state, "", "/app?x=1");
  });

  it("keeps the HashRouter route and other parameters", () => {
    const { win, state, replaceState } = fakeWindow(`https://app.test/#/import?sync=${CODE}&tab=2`);
    expect(consumePairingFragment(win)).toBe(CODE);
    expect(replaceState).toHaveBeenCalledExactlyOnceWith(state, "", "/#/import?tab=2");
    const routeOnly = fakeWindow(`https://app.test/#/import?sync=${CODE}`);
    consumePairingFragment(routeOnly.win);
    expect(routeOnly.replaceState).toHaveBeenCalledWith(routeOnly.state, "", "/#/import");
    const other = fakeWindow(`https://app.test/#a=1&sync=${CODE}`);
    consumePairingFragment(other.win);
    expect(other.replaceState).toHaveBeenCalledWith(other.state, "", "/#a=1");
  });

  it("leaves URLs without a code alone", () => {
    const { win, replaceState } = fakeWindow("https://app.test/#/settings");
    expect(consumePairingFragment(win)).toBeNull();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("is a no-op outside a browser and uses window by default", () => {
    expect(consumePairingFragment()).toBeNull();
    const { win, replaceState } = fakeWindow(`https://app.test/#sync=${CODE}`);
    vi.stubGlobal("window", win);
    expect(consumePairingFragment()).toBe(CODE);
    expect(replaceState).toHaveBeenCalledOnce();
  });
});
