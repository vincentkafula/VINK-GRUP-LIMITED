import { useEffect, useState, type ReactNode } from "react";
import { Command } from "cmdk";
import * as Dialog from "@radix-ui/react-dialog";
import { Search } from "lucide-react";

export interface PaletteItem { id: string; label: string; group: string; hint?: string; icon?: ReactNode; keywords?: string[]; run: () => void }

/** ⌘K / Ctrl+K from anywhere. Returns the open state so a search button can open it too. */
export function useCommandPalette(): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return [open, setOpen];
}

/** Search every destination and action in one place. Arrow keys move, Enter runs, Escape closes (cmdk and Radix provide all of it). */
export function CommandPalette({ open, onOpenChange, items, placeholder = "Search pages and actions…" }: { open: boolean; onOpenChange: (o: boolean) => void; items: PaletteItem[]; placeholder?: string }) {
  const groups = [...new Set(items.map((i) => i.group))];
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[220] bg-[var(--vk-overlay)] backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content aria-describedby={undefined} className="fixed left-1/2 top-[12vh] z-[230] w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-vk-xl border border-line bg-surface text-fg shadow-overlay focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
          <Dialog.Title className="sr-only">Search</Dialog.Title>
          <Command label="Search pages and actions" className="flex max-h-[70dvh] flex-col">
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search className="size-5 shrink-0 text-fg-muted" aria-hidden="true" />
              <Command.Input autoFocus placeholder={placeholder} className="h-14 w-full bg-transparent text-base text-fg placeholder:text-fg-subtle focus:outline-none" />
              <kbd className="hidden rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-fg-muted sm:block">Esc</kbd>
            </div>
            <Command.List className="overflow-y-auto p-2">
              <Command.Empty className="px-4 py-10 text-center text-sm text-fg-muted">Nothing matches that. Try another word.</Command.Empty>
              {groups.map((g) => (
                <Command.Group key={g} heading={g} className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-fg-muted">
                  {items.filter((i) => i.group === g).map((i) => (
                    <Command.Item key={i.id} value={`${i.group} ${i.label} ${(i.keywords ?? []).join(" ")}`} onSelect={() => { onOpenChange(false); i.run(); }}
                      className="flex min-h-11 cursor-pointer items-center gap-3 rounded-vk-md px-3 py-2 text-sm text-fg data-[selected=true]:bg-surface-2">
                      {i.icon && <span className="text-fg-muted" aria-hidden="true">{i.icon}</span>}
                      <span className="flex-1">{i.label}</span>
                      {i.hint && <span className="text-xs text-fg-muted">{i.hint}</span>}
                    </Command.Item>))}
                </Command.Group>))}
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
