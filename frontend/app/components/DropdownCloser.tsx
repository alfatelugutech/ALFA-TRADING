"use client";

import { useEffect } from "react";

// Ensures dropdown <details> menus close when clicking outside or pressing Escape
export default function DropdownCloser() {
  useEffect(() => {
    const closeAll = () => {
      document.querySelectorAll<HTMLDetailsElement>(".dropdown details[open]").forEach((el) => {
        el.removeAttribute("open");
      });
    };

    const handleDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      // If click is inside any open dropdown, do nothing
      const isInside = !!target?.closest?.(".dropdown details[open]");
      if (!isInside) closeAll();
    };

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAll();
    };

    const handleMenuClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.(".dropdown .menu a")) closeAll();
    };

    document.addEventListener("click", handleDocClick);
    document.addEventListener("keyup", handleKey);
    document.addEventListener("click", handleMenuClick, true);
    return () => {
      document.removeEventListener("click", handleDocClick);
      document.removeEventListener("keyup", handleKey);
      document.removeEventListener("click", handleMenuClick, true);
    };
  }, []);

  return null;
}


