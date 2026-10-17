# Install Lyra on your phone

Lyra can be installed from its HTTPS address and launched from a home-screen icon in a standalone window. The supplied logo/icons and cyan dark theme carry into the installation and launch experience. No app-store download is required.

## Android

Open the deployed app in Chrome and sign in. Open Lyra's navigation drawer and tap **Install Lyra**. When Chrome offers an installation prompt, confirm it. You can also use Chrome's menu → **Install app** or **Add to Home screen**. Open the new Lyra icon to launch the app.

## iPhone and iPad

Open the deployed app in Safari and sign in. Tap **Share** → **Add to Home Screen** (expand **More** if necessary). Keep **Open as Web App** enabled if offered and tap **Add**. Launch Lyra from its home-screen icon. The in-app **Install Lyra** button explains these steps because iOS does not expose the Chromium install prompt.

You may need to authenticate again in the installed app. Cloudflare Access still protects conversations, reports, and research actions. Installing Lyra does not bypass authentication.

## Offline behavior

Chat and research require a connection. If you reopen the installed app offline, it shows a generic reconnect screen. Already submitted research continues on the server. Reconnect and retry to load saved progress.

The service worker caches **only** `/offline.html` and `/logo.png`. It never caches signed-in HTML, chat history, API responses, downloaded reports, or submitted messages. It passes through HTTP errors and authentication redirects. A failed/redirected asset fetch aborts offline installation instead of storing an Access login page.

The worker registers only in a production build over HTTPS (or loopback for testing), uses network-first navigation with an offline fallback, and checks for script updates without the HTTP cache. Activation removes earlier `lyra-pwa-*` caches. Bump the cache version in `public/sw.js` whenever changing the offline page or logo. Worker updates do not force a page reload or discard an unsent draft.

## Deploy and verify

Deploy to the real HTTPS hostname following [deployment.md](deployment.md). Phone installation cannot use the development server's `127.0.0.1` address on your computer. The manifest uses credentialed fetching so it can load behind Access; `/sw.js` is served as JavaScript with root scope and no HTTP caching. Keep these assets on the same origin as the app. No Access bypass policy is needed.

Check a production build on Android Chrome and iOS Safari: installation, icon appearance, standalone launch, sign-in/session expiry, offline reopen, online recovery, and continued research after closing the app. Inspect Cache Storage to confirm that no conversation or API response is stored. Vite development deliberately does not register a service worker.

References: [MDN installability](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable), [MDN caching](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Caching).
