"use client";

import React, { useEffect, useRef } from "react";

export default function AlertSound({ trigger }: { trigger: number }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    if (!trigger) return;
    try {
      audioRef.current?.play().catch(() => {});
    } catch {}
  }, [trigger]);
  return (
    <audio ref={audioRef} preload="auto">
      <source src="data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAEAfAAACABAAZGF0YQgAAAAA" type="audio/wav" />
    </audio>
  );
}


