/// <reference lib="webworker" />
import { registerAppShell } from "./base.ts";

// Precache, offline navigation and prompt-based updates (owned: base.ts).
registerAppShell();

// App-specific handlers go below — push, notificationclick, background sync,
// runtime caching. Example:
//
// declare const self: ServiceWorkerGlobalScope;
// self.addEventListener("push", (event) => { … });
