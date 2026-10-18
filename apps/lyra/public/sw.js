/* Only public branding and a generic offline page may enter this cache.
 * Authenticated documents, API responses, reports and mutations stay network-only.
 * Bump the version when changing offline.html or the cached logo. */
const CACHE_NAME = "lyra-pwa-v2";
const OFFLINE_URL = "/offline.html";
const OFFLINE_ASSETS = [OFFLINE_URL, "/logo.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      // Validate all responses first: an expired Access session must never cache a login redirect.
      const responses = await Promise.all(
        OFFLINE_ASSETS.map(async (path) => {
          const response = await fetch(
            new Request(path, { credentials: "same-origin", cache: "no-store", redirect: "error" }),
          );
          const expectedType = path.endsWith(".html") ? "text/html" : "image/png";
          if (
            !response.ok ||
            response.redirected ||
            !response.headers.get("content-type")?.includes(expectedType)
          ) {
            throw new Error("Offline assets unavailable");
          }
          return [path, response];
        }),
      );
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(responses.map(([path, response]) => cache.put(path, response)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("lyra-pwa-") && name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  const navigation = request.mode === "navigate" && url.pathname === "/";
  const offlineAsset = OFFLINE_ASSETS.includes(url.pathname) && !url.search;
  if (!navigation && !offlineAsset) return;
  event.respondWith(
    (async () => {
      try {
        // Preserve HTTP errors and authentication redirects. Never cache a network response here.
        return await fetch(request);
      } catch {
        const cached = await (
          await caches.open(CACHE_NAME)
        ).match(navigation ? OFFLINE_URL : url.pathname);
        return (
          cached ||
          new Response("You’re offline. Reconnect and reopen Lyra.", {
            status: 503,
            headers: { "content-type": "text/plain; charset=utf-8" },
          })
        );
      }
    })(),
  );
});
