import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../ui/utils";

/**
 * The one way to show something over the page: a modal dialog or a side sheet. Built on Radix, so it comes with what hand-built overlays lack:
 * a role and accessible name, focus moved in and trapped, Escape and outside click to close, focus returned to the trigger, and page scroll locked.
 */
interface OverlayProps { open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string; children: ReactNode; className?: string; hideTitle?: boolean }

export function Modal({ open, onOpenChange, title, description, children, className, hideTitle }: OverlayProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[200] bg-[var(--vk-overlay)] backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content className={cn("fixed left-1/2 top-1/2 z-[210] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-vk-xl border border-line bg-surface p-6 text-fg shadow-overlay focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 max-h-[calc(100dvh-2rem)] overflow-y-auto", className)}>
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className={hideTitle ? "sr-only" : ""}><Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>{description && <Dialog.Description className="mt-1 text-sm text-fg-muted">{description}</Dialog.Description>}</div>
            <Dialog.Close aria-label="Close" className="-mr-2 -mt-2 inline-flex size-11 items-center justify-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg"><X className="size-5" aria-hidden="true" /></Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** A panel that slides in from the left or right: used for the mobile menu and the dashboard menu on small screens. */
export function Sheet({ open, onOpenChange, title, side = "left", children, className }: OverlayProps & { side?: "left" | "right" }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[200] bg-[var(--vk-overlay)] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content aria-describedby={undefined} className={cn("fixed inset-y-0 z-[210] flex w-[min(88vw,22rem)] flex-col bg-surface text-fg shadow-overlay focus:outline-none data-[state=open]:animate-in", side === "left" ? "left-0 border-r border-line data-[state=open]:slide-in-from-left" : "right-0 border-l border-line data-[state=open]:slide-in-from-right", className)}>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <Dialog.Title className="text-base font-semibold">{title}</Dialog.Title>
            <Dialog.Close aria-label="Close" className="inline-flex size-11 items-center justify-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg"><X className="size-5" aria-hidden="true" /></Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
