import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type PictureInPictureAPI = { requestWindow: (options: { width: number; height: number }) => Promise<Window> };

export function useFloatingGerald(onWindow: (window: Window | null) => void) {
  const [floatingWindow, setFloatingWindow] = useState<Window | null>(null);
  const current = useRef<Window | null>(null);
  const callback = useRef(onWindow);
  callback.current = onWindow;
  const close = () => current.current?.close();
  const open = async () => {
    const api = (window as Window & { documentPictureInPicture?: PictureInPictureAPI }).documentPictureInPicture;
    if (!api) throw new Error("Floating Gerald needs desktop Chrome or Edge. This browser can only show his corner inside the app.");
    if (current.current && !current.current.closed) { current.current.focus(); return; }
    const next = await api.requestWindow({ width: 320, height: 440 });
    next.document.title = "Sigh-cus — Gerald’s corner";
    for (const source of document.querySelectorAll('link[rel="stylesheet"], style')) {
      const copy = source.cloneNode(true) as HTMLElement;
      if (copy instanceof HTMLLinkElement) copy.href = (source as HTMLLinkElement).href;
      next.document.head.append(copy);
    }
    next.document.documentElement.className = document.documentElement.className;
    next.document.body.className = "floating-gerald-body";
    current.current = next;
    setFloatingWindow(next);
    callback.current(next);
    next.addEventListener("pagehide", () => {
      if (current.current !== next) return;
      current.current = null;
      setFloatingWindow(null);
      callback.current(null);
    }, { once: true });
  };
  useEffect(() => () => { current.current?.close(); }, []);
  return { floatingWindow, open, close };
}

export function FloatingGerald({ window: floatingWindow, sourceVideo, children }: {
  window: Window;
  sourceVideo: HTMLVideoElement | null;
  children: ReactNode;
}) {
  const video = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const target = video.current;
    if (!target) return;
    const sync = () => {
      if (target.srcObject !== sourceVideo?.srcObject) {
        target.srcObject = sourceVideo?.srcObject ?? null;
        if (target.srcObject) void target.play().catch(() => undefined);
      }
    };
    sync();
    const id = floatingWindow.setInterval(sync, 300);
    return () => { floatingWindow.clearInterval(id); target.srcObject = null; };
  }, [floatingWindow, sourceVideo]);
  return createPortal(<section className="floating-gerald-content" aria-label="Floating Gerald">
    {children}
    <video ref={video} autoPlay muted playsInline className="floating-camera" aria-label="Live camera" />
  </section>, floatingWindow.document.body);
}