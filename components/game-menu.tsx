"use client";

import { useEffect, useRef } from "react";
import { ConfirmResignButton } from "@/components/confirm-resign-button";

type Props = {
  gameId: string;
  onRotate?: () => void;
  resignAction?: (formData: FormData) => Promise<void>;
  drawAction?: (formData: FormData) => Promise<void>;
};

export function GameMenu({ gameId, onRotate, resignAction, drawAction }: Props) {
  const details = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  function fitPanel() {
    if (!details.current?.open || !trigger.current || !panel.current) return;
    const viewportTop = window.visualViewport?.offsetTop ?? 0;
    const availableHeight = trigger.current.getBoundingClientRect().top - viewportTop - 14;
    panel.current.style.maxHeight = `${Math.max(44, availableHeight)}px`;
  }

  function close() {
    if (details.current) details.current.open = false;
  }

  useEffect(() => {
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !details.current?.contains(event.target)) close();
    }
    function focusOutside(event: FocusEvent) {
      if (event.target instanceof Node && !details.current?.contains(event.target)) close();
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape" && details.current?.open) {
        event.preventDefault();
        close();
        trigger.current?.focus();
      }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", focusOutside);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", fitPanel);
    window.addEventListener("scroll", fitPanel, true);
    window.visualViewport?.addEventListener("resize", fitPanel);
    window.visualViewport?.addEventListener("scroll", fitPanel);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", focusOutside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", fitPanel);
      window.removeEventListener("scroll", fitPanel, true);
      window.visualViewport?.removeEventListener("resize", fitPanel);
      window.visualViewport?.removeEventListener("scroll", fitPanel);
    };
  }, []);

  return (
    <details className="game-menu" ref={details} onToggle={fitPanel}>
      <summary className="button small game-menu-trigger" ref={trigger} aria-label="Game menu">
        <span aria-hidden="true">⋯</span>
      </summary>
      <div className="game-menu-panel" ref={panel}>
        {onRotate && <button type="button" onClick={() => { onRotate(); close(); trigger.current?.focus(); }}>
          <span aria-hidden="true">↻</span> Rotate board
        </button>}
        {drawAction && <form action={drawAction} onSubmit={close}>
          <input type="hidden" name="gameId" value={gameId} />
          <button type="submit" name="response" value="offer">Offer draw</button>
        </form>}
        {resignAction && <form className="game-menu-resign" action={resignAction} onSubmit={close}>
          <input type="hidden" name="gameId" value={gameId} />
          <ConfirmResignButton />
        </form>}
      </div>
    </details>
  );
}
