import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "../lib/utils";

export const Sheet = Dialog.Root;
export const SheetTrigger = Dialog.Trigger;
export const SheetClose = Dialog.Close;
export function SheetContent({
  children,
  title,
  description,
  side = "left",
  className,
  ...props
}: React.ComponentProps<typeof Dialog.Content> & {
  title: string;
  description?: string;
  side?: "left" | "right" | "bottom";
}) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-black/25" />
      <Dialog.Content
        {...props}
        className={cn(
          "fixed z-50 flex flex-col border-border bg-card outline-none",
          side === "left"
            ? "inset-y-0 left-0 w-[min(85vw,320px)] border-r"
            : side === "right"
              ? "inset-x-0 bottom-0 max-h-[85dvh] w-full rounded-t-[28px] border-t pb-[env(safe-area-inset-bottom)] sm:inset-x-auto sm:inset-y-0 sm:right-0 sm:max-h-none sm:w-[420px] sm:rounded-none sm:border-t-0 sm:border-l sm:pb-0"
              : "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-[28px] border-t pb-[env(safe-area-inset-bottom)]",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 px-6 pb-2 pt-6">
          <div>
            <Dialog.Title className="text-lg font-medium">{title}</Dialog.Title>
            <Dialog.Description
              className={cn("mt-1 text-xs text-muted-foreground", !description && "sr-only")}
            >
              {description || title}
            </Dialog.Description>
          </div>
          <Dialog.Close
            aria-label="Close panel"
            className="rounded-md p-2 text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" />
          </Dialog.Close>
        </div>
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  );
}
