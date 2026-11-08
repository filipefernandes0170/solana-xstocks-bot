import { Check, Copy, ImageDown, Send, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { telegramShareUrl, xShareUrl } from "../lib/share";
import { downloadBlob } from "./share/canvas";

export type ShareImage = { name: string; make: () => Promise<Blob | null> };

/**
 * Share a name, a size check or the ranking. Without a picture, phones get the system share sheet and other screens
 * a small menu (copy, X, Telegram). With a picture, every screen gets the menu, so "Save image" is always one tap
 * away; phones also get "Share…" for the system sheet. The text is built at the moment of sharing.
 */
export function ShareButton({
  title,
  text,
  url,
  tone = "light",
  label = "Share",
  image,
}: {
  title: string;
  text: string;
  url: string;
  tone?: "light" | "dark";
  label?: string;
  image?: ShareImage;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function"), []);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  async function start() {
    const touch = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
    if (!image && touch && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch {
        // Cancelled or refused: fall back to the menu.
      }
    }
    setOpen((value) => !value);
  }

  async function systemShare() {
    try {
      await navigator.share({ title, text, url });
      setOpen(false);
    } catch {
      // Cancelled: the menu stays open.
    }
  }

  async function saveImage() {
    if (!image) return;
    setSaving(true);
    try {
      const blob = await image.make();
      if (blob) downloadBlob(blob, image.name);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  const base = tone === "dark" ? "bg-dusk text-foam ring-1 ring-white/15" : "bg-field text-ink ring-1 ring-line";
  const item = "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-ink hover:bg-field";
  return (
    <div ref={box} className="relative inline-flex">
      <button
        type="button"
        onClick={() => void start()}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label ? undefined : `Share: ${title}`}
        className={`inline-flex h-11 items-center gap-1.5 rounded-full text-sm font-medium ${label ? "px-4" : "w-11 justify-center"} ${base}`}
      >
        <Share2 className="size-4" aria-hidden />
        {label}
      </button>
      {open ? (
        <div role="menu" className="panel absolute bottom-full right-0 z-40 mb-2 w-56 p-1.5 ring-1 ring-line">
          {image && canShare ? (
            <button type="button" role="menuitem" onClick={() => void systemShare()} className={item}>
              <Share2 className="size-4" aria-hidden />
              Share…
            </button>
          ) : null}
          {image ? (
            <button type="button" role="menuitem" disabled={saving} onClick={() => void saveImage()} className={`${item} disabled:opacity-60`}>
              <ImageDown className="size-4" aria-hidden />
              {saving ? "Drawing…" : "Save image"}
            </button>
          ) : null}
          <button type="button" role="menuitem" onClick={() => void copy()} className={item}>
            {copied ? <Check className="size-4 text-pine" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            {copied ? "Copied" : "Copy text and link"}
          </button>
          <a role="menuitem" href={xShareUrl(text, url)} target="_blank" rel="noreferrer" className={item}>
            <span aria-hidden className="inline-flex size-4 items-center justify-center text-[13px] font-semibold">
              X
            </span>
            Post on X
          </a>
          <a role="menuitem" href={telegramShareUrl(text, url)} target="_blank" rel="noreferrer" className={item}>
            <Send className="size-4" aria-hidden />
            Send on Telegram
          </a>
        </div>
      ) : null}
    </div>
  );
}
