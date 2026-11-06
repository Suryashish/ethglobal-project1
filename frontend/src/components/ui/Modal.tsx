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
        <Dialog.Overlay className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#2a241b]/45 p-4">
          <Dialog.Content className="relative w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-[0_24px_60px_-20px_rgb(40_30_15/0.45)]">
            <Dialog.Title className="pr-8 font-serif text-2xl leading-tight">{title}</Dialog.Title>
            {description ? <Dialog.Description className="mt-2 text-sm leading-relaxed text-muted">{description}</Dialog.Description> : null}
            <div className="mt-5">{children}</div>
            <Dialog.Close className="absolute right-4 top-4 rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Close">
              <X className="size-4" />
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
