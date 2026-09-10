"use client";

// components/auth/AuthCard.tsx
// The shell both auth pages sit in.
//
// Shared rather than duplicated so sign-in and sign-up cannot drift: they are
// the same surface with different contents, and a member moving between them
// should not feel the page change underneath.
//
// Laid out after shadcn's login-04: the form on the left, a chapter photo on
// the right, both inside one card. Below `md` the photo drops away and the
// card is the form alone, so a phone never downloads or scrolls past it.

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";

import styles from "./auth.module.css";

/// Chapter photos, pre-cropped to 4:5 portrait so either form's height frames
/// them the same way. The same set the iOS app's sign-in uses.
const PHOTO_COUNT = 17;
/// How long each photo holds before the next fades in. Matches the app.
const HOLD_MS = 6000;
/// A touch longer than the CSS fade, so a layer is only reloaded once it has
/// finished fading out.
const FADE_MS = 1600;

const photoSrc = (n: number) => `/login/login-${n}.png`;

/// Every photo once, in a random order. A new pass never opens on the photo
/// that just showed, so the seam between passes can't repeat one.
function shuffledPass(last?: number): number[] {
  const pass = Array.from({ length: PHOTO_COUNT }, (_, i) => i + 1);
  for (let i = pass.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pass[i], pass[j]] = [pass[j], pass[i]];
  }
  if (pass[0] === last) [pass[0], pass[pass.length - 1]] = [pass[pass.length - 1], pass[0]];
  return pass;
}

export default function AuthCard({
  heading,
  subheading,
  children,
  footer,
}: {
  heading: string;
  subheading: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  // Two stacked layers that swap opacity. The hidden one is always loading
  // the next photo, and a swap waits until it has, so a fade never starts on
  // an image that is still arriving.
  //
  // Picked after mount, not during render: a random choice on the server
  // would differ from the browser's and fail hydration. The panel's muted
  // ground holds the space until the first photo fades in.
  const [slots, setSlots] = useState<[string | null, string | null]>([null, null]);
  const [front, setFront] = useState<0 | 1>(0);
  const frontRef = useRef<0 | 1>(0);
  const loaded = useRef<[boolean, boolean]>([false, false]);
  const queue = useRef<number[]>([]);
  const last = useRef<number | undefined>(undefined);

  const nextSrc = useCallback(() => {
    if (queue.current.length === 0) queue.current = shuffledPass(last.current);
    const n = queue.current.shift()!;
    last.current = n;
    return photoSrc(n);
  }, []);

  useEffect(() => {
    setSlots([nextSrc(), nextSrc()]);

    let cancelled = false;
    let timer: number | undefined;
    const schedule = (delay: number) => {
      timer = window.setTimeout(() => {
        if (cancelled) return;
        const back: 0 | 1 = frontRef.current === 0 ? 1 : 0;
        // Not there yet: look again shortly rather than waiting a whole hold.
        if (!loaded.current[back]) return schedule(500);

        frontRef.current = back;
        setFront(back);

        // Once the old photo has faded out, start the next one loading in it.
        window.setTimeout(() => {
          if (cancelled) return;
          const hidden: 0 | 1 = back === 0 ? 1 : 0;
          loaded.current[hidden] = false;
          setSlots((current) => {
            const updated: [string | null, string | null] = [...current];
            updated[hidden] = nextSrc();
            return updated;
          });
        }, FADE_MS);

        schedule(HOLD_MS);
      }, delay);
    };
    schedule(HOLD_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [nextSrc]);

  return (
    <main
      className={`${styles.stage} flex min-h-screen items-center justify-center px-4 py-10 md:px-10`}
    >
      <div className="w-full max-w-sm md:max-w-4xl">
        <div className={`${styles.card} grid overflow-hidden md:grid-cols-2`}>
          <div className="flex flex-col justify-center px-6 py-8 sm:px-8 md:px-10 md:py-12">
            <div className="mb-7 flex flex-col items-center text-center">
              <Image
                src="/ot.png"
                alt="Theta Tau"
                width={96}
                height={96}
                priority
                className={`${styles.mark} h-14 w-14 object-contain`}
              />
              <h1
                className={`${styles.rise} ${styles.d1} m-0 mt-4 text-2xl font-semibold tracking-tight text-foreground`}
              >
                {heading}
              </h1>
              <p
                className={`${styles.rise} ${styles.d2} m-0 mt-1 text-sm text-muted-foreground`}
              >
                {subheading}
              </p>
            </div>

            {children}

            {footer ? (
              <p
                className={`${styles.rise} ${styles.d6} m-0 mt-6 text-center text-sm text-muted-foreground`}
              >
                {footer}
              </p>
            ) : null}
          </div>

          {/* Decorative, so empty alt: the page says the same thing without it. */}
          <div className={`${styles.media} relative hidden bg-muted md:block`}>
            {slots.map((src, i) =>
              src ? (
                // The fade lives on this wrapper, not the image: the image's
                // entrance keyframes fill forwards and would pin its opacity.
                <div
                  key={i}
                  className={styles.slot}
                  style={{ opacity: front === i ? 1 : 0 }}
                >
                  <Image
                    src={src}
                    alt=""
                    fill
                    sizes="(min-width: 768px) 448px, 1px"
                    className={`${styles.mediaImage} object-cover`}
                    onLoad={() => {
                      loaded.current[i as 0 | 1] = true;
                    }}
                  />
                </div>
              ) : null
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
