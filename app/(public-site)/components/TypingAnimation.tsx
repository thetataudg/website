"use client";

import { useEffect, useMemo, useState } from "react";

type TypingAnimationProps = {
  words: string[];
  className?: string;
  typeSpeed?: number;
  deleteSpeed?: number;
  pauseMs?: number;
  startDelay?: number;
  showCursor?: boolean;
  cursor?: string;
};

export default function TypingAnimation({
  words,
  className,
  typeSpeed = 95,
  deleteSpeed = 60,
  pauseMs = 1200,
  startDelay = 0,
  showCursor = true,
  cursor = "|",
}: TypingAnimationProps) {
  const normalizedWords = useMemo(
    () => words.filter((word) => Boolean(word && word.trim())),
    [words]
  );
  const [hasStarted, setHasStarted] = useState(startDelay === 0);
  const [wordIndex, setWordIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (hasStarted || startDelay <= 0) return;
    const timer = window.setTimeout(() => setHasStarted(true), startDelay);
    return () => window.clearTimeout(timer);
  }, [hasStarted, startDelay]);

  useEffect(() => {
    if (!hasStarted || normalizedWords.length === 0) return;

    const currentWord = normalizedWords[wordIndex] || "";
    const graphemes = Array.from(currentWord);
    const atWordEnd = charIndex >= graphemes.length;
    const atWordStart = charIndex <= 0;

    const timeoutMs = !isDeleting && atWordEnd
      ? pauseMs
      : isDeleting
        ? deleteSpeed
        : typeSpeed;

    const timer = window.setTimeout(() => {
      if (!isDeleting) {
        if (!atWordEnd) {
          setCharIndex((prev) => prev + 1);
        } else if (normalizedWords.length > 1) {
          setIsDeleting(true);
        }
        return;
      }

      if (!atWordStart) {
        setCharIndex((prev) => prev - 1);
        return;
      }

      setIsDeleting(false);
      setWordIndex((prev) => (prev + 1) % normalizedWords.length);
    }, timeoutMs);

    return () => window.clearTimeout(timer);
  }, [
    hasStarted,
    normalizedWords,
    wordIndex,
    charIndex,
    isDeleting,
    pauseMs,
    typeSpeed,
    deleteSpeed,
  ]);

  if (normalizedWords.length === 0) return null;

  const activeWord = normalizedWords[wordIndex] || "";
  const displayedText = Array.from(activeWord).slice(0, charIndex).join("");

  return (
    <span className={className}>
      {displayedText}
      {showCursor && (
        <span className="typing-cursor typing-cursor--blink">{cursor}</span>
      )}
    </span>
  );
}
