import { useEffect, useState } from "react";
import { Download, Share, Smartphone } from "lucide-react";
import { Button, Sheet, SheetContent } from "@citadel/ui";
import {
  clearInstallPrompt,
  getInstallState,
  subscribeInstallState,
  type InstallPromptEvent,
} from "../lib/pwa";

export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)");
    const sync = () => {
      const state = getInstallState();
      setPrompt(state.prompt);
      setInstalled(
        state.installed ||
          standalone.matches ||
          (navigator as Navigator & { standalone?: boolean }).standalone === true,
      );
    };
    setIos(
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
    );
    sync();
    const unsubscribe = subscribeInstallState(sync);
    standalone.addEventListener("change", sync);
    return () => {
      unsubscribe();
      standalone.removeEventListener("change", sync);
    };
  }, []);

  async function install() {
    if (!prompt) {
      setHelpOpen(true);
      return;
    }
    setInstalling(true);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
    } catch {
      setError(true);
      setHelpOpen(true);
    } finally {
      clearInstallPrompt();
      setInstalling(false);
    }
  }

  if (installed) return null;
  return (
    <>
      <Button
        variant="ghost"
        className="w-full justify-start text-xs"
        disabled={installing}
        onClick={() => {
          void install();
        }}
      >
        <Download />
        {installing ? "Opening installer…" : "Install Lyra"}
      </Button>
      <Sheet open={helpOpen} onOpenChange={setHelpOpen}>
        <SheetContent
          side="bottom"
          title="Install Lyra"
          description="Add Lyra to your home screen and open it in its own window."
        >
          <div className="mx-auto w-full max-w-lg space-y-5 overflow-y-auto px-6 py-6 text-sm leading-7">
            <div className="flex items-center gap-3">
              <img
                src="/android-chrome-192x192.png"
                alt=""
                width={44}
                height={44}
                className="size-11 rounded-lg"
              />
              <p className="font-medium">Lyra on your home screen.</p>
            </div>
            {error && (
              <p role="status" className="text-muted-foreground">
                The install prompt couldn’t open. You can use your browser’s menu instead.
              </p>
            )}
            {ios ? (
              <ol className="list-decimal space-y-2 pl-5">
                <li>Open Lyra in Safari and sign in.</li>
                <li>
                  Tap <Share className="inline size-4" aria-hidden="true" /> <strong>Share</strong>,
                  then <strong>Add to Home Screen</strong>. You may need to tap{" "}
                  <strong>More</strong> first.
                </li>
                <li>
                  Keep <strong>Open as Web App</strong> enabled if shown, then tap{" "}
                  <strong>Add</strong>.
                </li>
              </ol>
            ) : (
              <ol className="list-decimal space-y-2 pl-5">
                <li>
                  Open Lyra in Chrome on Android, or Chrome/Edge on your computer, and sign in.
                </li>
                <li>
                  Open the browser menu and choose <strong>Install app</strong> or{" "}
                  <strong>Add to Home screen</strong>.
                </li>
                <li>Confirm installation, then launch Lyra from its new icon.</li>
              </ol>
            )}
            <p className="flex items-start gap-2 text-xs leading-6 text-muted-foreground">
              <Smartphone className="mt-1 size-4 shrink-0" />
              Chat and research need an internet connection. You may need to sign in again when
              opening the installed app.
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
