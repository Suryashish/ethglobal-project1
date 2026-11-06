"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

/** Centered dialog without a CSS transform (so `position: fixed` children, like the World simulator, still work). */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4">
          <Dialog.Content className="relative w-full max-w-md rounded-xl border border-line bg-surface p-6 shadow-2xl">
            <Dialog.Title className="pr-8 text-lg font-semibold">{title}</Dialog.Title>
            {description ? <Dialog.Description className="mt-2 text-sm text-muted">{description}</Dialog.Description> : null}
            <div className="mt-5">{children}</div>
            <Dialog.Close className="absolute right-4 top-4 rounded p-1 text-muted hover:text-fg" aria-label="Close">
              <X className="size-4" />
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
