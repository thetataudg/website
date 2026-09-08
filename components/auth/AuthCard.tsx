// components/auth/AuthCard.tsx
// The shell both auth pages sit in.
//
// Shared rather than duplicated so sign-in and sign-up cannot drift: they are
// the same surface with different contents, and a member moving between them
// should not feel the page change underneath.

import Image from "next/image";

import styles from "./auth.module.css";

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
  return (
    <main
      className={`${styles.stage} flex min-h-screen items-center justify-center px-4 py-10`}
    >
      <div className="w-full max-w-md">
        <div className={`${styles.card} px-6 py-8 sm:px-8`}>
          <div className="mb-7 flex flex-col items-center text-center">
            <Image
              src="/ot.png"
              alt="Theta Tau"
              width={112}
              height={112}
              priority
              className={`${styles.mark} h-[5.5rem] w-[5.5rem] object-contain`}
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
        </div>

        {footer ? (
          <p
            className={`${styles.rise} ${styles.d4} m-0 mt-5 text-center text-sm text-muted-foreground`}
          >
            {footer}
          </p>
        ) : null}
      </div>
    </main>
  );
}
