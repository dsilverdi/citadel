import { readFileSync, existsSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const origin = "https://lyra.example.com";
const script = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

function worker(network: (request: Request) => Promise<Response>) {
  const listeners = new Map<string, (event: unknown) => void>();
  const stores = new Map<string, Map<string, Response>>();
  const key = (value: string | Request) =>
    new URL(typeof value === "string" ? value : value.url, origin).href;
  const cache = (name: string) => {
    const entries = stores.get(name) || new Map<string, Response>();
    stores.set(name, entries);
    return {
      put: async (request: string | Request, response: Response) => {
        entries.set(key(request), response);
      },
      match: async (request: string | Request) => entries.get(key(request))?.clone(),
    };
  };
  runInNewContext(script, {
    self: {
      location: { origin },
      addEventListener: (type: string, listener: (event: unknown) => void) =>
        listeners.set(type, listener),
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
    },
    caches: {
      open: async (name: string) => cache(name),
      keys: async () => [...stores.keys()],
      delete: async (name: string) => stores.delete(name),
    },
    fetch: network,
    Request: class extends Request {
      constructor(path: string, options?: RequestInit) {
        super(new URL(path, origin), options);
      }
    },
    Response,
    URL,
  });
  return {
    stores,
    async lifecycle(type: string) {
      let pending: Promise<void> | undefined;
      listeners.get(type)?.({
        waitUntil: (promise: Promise<void>) => {
          pending = promise;
        },
      });
      await pending;
    },
    fetch(path: string, method = "GET", mode = "navigate") {
      let response: Promise<Response> | undefined;
      listeners.get("fetch")?.({
        request: { url: new URL(path, origin).href, method, mode },
        respondWith: (promise: Promise<Response>) => {
          response = promise;
        },
      });
      return response;
    },
  };
}

describe("PWA offline privacy and recovery", () => {
  const assets = async (request: Request) =>
    new Response(request.url.endsWith(".png") ? "logo" : "Offline screen", {
      headers: { "content-type": request.url.endsWith(".png") ? "image/png" : "text/html" },
    });
  it("only precaches the generic offline page and supplied logo", async () => {
    const sw = worker(assets);
    await sw.lifecycle("install");
    expect([...sw.stores.get("lyra-pwa-v3")!.keys()]).toEqual([
      `${origin}/offline.html`,
      `${origin}/logo.png`,
    ]);
  });
  it("restores a generic offline screen without caching a private conversation", async () => {
    let offline = false;
    const sw = worker(async (request) => {
      if (offline) throw new TypeError("Offline");
      return assets(request);
    });
    await sw.lifecycle("install");
    offline = true;
    expect(await (await sw.fetch("/?c=private-conversation"))!.text()).toBe("Offline screen");
    expect(sw.stores.get("lyra-pwa-v3")!.has(`${origin}/?c=private-conversation`)).toBe(false);
  });
  it("does not intercept API calls, reports, mutations, or another origin", () => {
    const sw = worker(assets);
    expect(sw.fetch("/api/conversations", "GET", "cors")).toBeUndefined();
    expect(sw.fetch("/api/conversations/c/runs/r/report")).toBeUndefined();
    expect(sw.fetch("/api/conversations", "POST", "cors")).toBeUndefined();
    expect(sw.fetch("https://another.example/")).toBeUndefined();
  });
  it("preserves authentication errors and never replaces them with a cached app", async () => {
    const sw = worker(async () => new Response("Sign in", { status: 401 }));
    const response = await sw.fetch("/");
    expect(response!.status).toBe(401);
    expect(await response!.text()).toBe("Sign in");
    expect(sw.stores.size).toBe(0);
  });
  it("refuses to cache login responses when installing", async () => {
    const sw = worker(async () => new Response("Login redirect", { status: 302 }));
    await expect(sw.lifecycle("install")).rejects.toThrow("Offline assets unavailable");
    expect(sw.stores.size).toBe(0);
  });
  it("removes old Lyra offline caches while preserving other caches", async () => {
    const sw = worker(assets);
    sw.stores.set("lyra-pwa-v0", new Map());
    sw.stores.set("another-app", new Map());
    await sw.lifecycle("install");
    await sw.lifecycle("activate");
    expect([...sw.stores.keys()].sort()).toEqual(["another-app", "lyra-pwa-v3"]);
  });
});

describe("home-screen manifest", () => {
  it("has a stable identity, standalone launch, and correctly sized supplied icons", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../public/site.webmanifest", import.meta.url), "utf8"),
    );
    expect(manifest).toMatchObject({
      id: "/",
      scope: "/",
      start_url: "/",
      display: "standalone",
      short_name: "Lyra",
      prefer_related_applications: false,
    });
    for (const size of [192, 512]) {
      const icon = manifest.icons.find(
        (entry: { sizes: string }) => entry.sizes === `${size}x${size}`,
      );
      expect(icon).toBeTruthy();
      const path = new URL(`../public${icon.src}`, import.meta.url);
      expect(existsSync(path)).toBe(true);
      const png = readFileSync(path);
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([size, size]);
    }
  });
});
