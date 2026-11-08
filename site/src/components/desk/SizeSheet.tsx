import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { SizeCheck } from "./SizeCheck";

/**
 * The desk's Size check, as a dialog over the page: the Size button on a card opens it on that name, so the
 * markets stay right under the hero. A native modal dialog keeps focus inside and closes on Escape.
 */
export function SizeSheet({
  open,
  symbol,
  onSymbol,
  onClose,
}: {
  open: boolean;
  symbol: string;
  onSymbol: (symbol: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="size-check-title"
      onClose={onClose}
      onClick={(event) => {
        // A click on the dimmed area around the panel lands on the dialog itself.
        if (event.target === ref.current) onClose();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(40rem,calc(100%-2rem))] overflow-y-auto rounded-[var(--radius-card)] bg-transparent p-0 text-ink backdrop:bg-night/75 backdrop:backdrop-blur-sm"
    >
      <div className="panel relative p-5 ring-1 ring-line sm:p-7">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the size check"
          className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-field hover:text-ink"
        >
          <X className="size-5" aria-hidden />
        </button>
        {open ? <SizeCheck symbol={symbol} onSymbol={onSymbol} variant="sheet" /> : null}
      </div>
    </dialog>
  );
}
