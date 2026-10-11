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

  function close() {
    if (details.current) details.current.open = false;
  }

  useEffect(() => {
    function outside(event: PointerEvent) {
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
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  return (
    <details className="game-menu" ref={details} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) close();
    }}>
      <summary className="button small game-menu-trigger" ref={trigger}>
        <span aria-hidden="true">⋯</span> Menu
      </summary>
      <div className="game-menu-panel">
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
