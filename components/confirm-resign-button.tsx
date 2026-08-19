"use client";

import type { MouseEvent } from "react";

export function ConfirmResignButton() {
  function confirmResignation(event: MouseEvent<HTMLButtonElement>) {
    if (!window.confirm("Are you sure you want to resign this game? This cannot be undone.")) {
      event.preventDefault();
    }
  }

  return (
    <button className="resign-button" type="submit" onClick={confirmResignation}>
      Resign game
    </button>
  );
}
