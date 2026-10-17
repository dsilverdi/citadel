export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const changeEvent = "lyra:installability";
let prompt: InstallPromptEvent | null = null;
let installed = false;
let initialized = false;

export function getInstallState() {
  return { prompt, installed };
}
export function clearInstallPrompt() {
  prompt = null;
  window.dispatchEvent(new Event(changeEvent));
}
export function subscribeInstallState(listener: () => void) {
  window.addEventListener(changeEvent, listener);
  return () => window.removeEventListener(changeEvent, listener);
}

export function initializePwa() {
  if (initialized) return;
  initialized = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    prompt = event as InstallPromptEvent;
    window.dispatchEvent(new Event(changeEvent));
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    clearInstallPrompt();
  });

  // Keep service workers out of Vite's development/HMR lifecycle.
  if (!import.meta.env.PROD || !window.isSecureContext || !("serviceWorker" in navigator)) return;
  const register = () => {
    void navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => {
        console.warn(
          "Lyra offline support could not be registered. Reopen the app while signed in.",
        );
      });
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
