"use client";

import { useEffect, useState } from "react";

/**
 * MapKit JS, loaded once per page and shared by every map on it.
 *
 * Apple's script is not on npm and is not meant to be bundled — it is served
 * from their CDN and authorises itself with a short-lived token, which this
 * fetches from `/api/maps/token` rather than embedding. That indirection is
 * the point: the token expires, and a page that had it baked in at build time
 * would be a map that quietly stops working.
 */

declare global {
  interface Window {
    mapkit?: any;
  }
}

const SCRIPT_ID = "apple-mapkit-js";
const SCRIPT_SRC = "https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js";

let pending: Promise<any> | null = null;

/**
 * The token, fetched before the script is.
 *
 * MapKit authorises asynchronously and reports a bad token through an event
 * long after `init` returns, which showed up as a blank grid where a map
 * should be. Asking the server first turns that into an honest error message,
 * because the server already knows whether it has a usable token.
 */
async function fetchToken(): Promise<string> {
  const response = await fetch("/api/maps/token");
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data?.error || "Apple Maps is unavailable.");
  }
  const { token } = await response.json();
  if (!token) throw new Error("Apple Maps is unavailable.");
  return token;
}

function initialise(mapkit: any, firstToken: string): Promise<any> {
  return new Promise((resolve) => {
    let token: string | null = firstToken;
    mapkit.init({
      authorizationCallback: async (done: (value: string) => void) => {
        // The first call is already paid for; later ones are MapKit renewing a
        // token that is about to run out.
        const value = token ?? (await fetchToken());
        token = null;
        done(value);
      },
    });
    resolve(mapkit);
  });
}

function loadMapKit(): Promise<any> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("MapKit JS only loads in a browser."));
  }
  if (pending) return pending;

  pending = new Promise((resolve, reject) => {
    if (window.mapkit?.Map) {
      resolve(window.mapkit);
      return;
    }

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement("script");

    const onLoad = () => {
      if (!window.mapkit) {
        reject(new Error("Apple Maps did not load."));
        return;
      }
      fetchToken()
        .then((token) => initialise(window.mapkit, token))
        .then(resolve, reject);
    };

    script.addEventListener("load", onLoad);
    script.addEventListener("error", () =>
      reject(new Error("Apple Maps could not be reached."))
    );

    if (!existing) {
      script.id = SCRIPT_ID;
      script.src = SCRIPT_SRC;
      script.async = true;
      script.crossOrigin = "anonymous";
      document.head.appendChild(script);
    } else if (window.mapkit) {
      onLoad();
    }
  }).catch((error) => {
    // A failed load must not poison every later attempt: the token may simply
    // have been refreshed since.
    pending = null;
    throw error;
  });

  return pending;
}

export type MapKitStatus = "loading" | "ready" | "error";

/**
 * Loads MapKit JS on demand.
 *
 * `enabled` is what keeps the script off pages that never need it — most
 * visits to the events list never open a map or type a location.
 */
export function useMapKit(enabled = true): {
  mapkit: any;
  status: MapKitStatus;
  error: string | null;
} {
  const [mapkit, setMapkit] = useState<any>(null);
  const [status, setStatus] = useState<MapKitStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let active = true;

    setStatus("loading");
    loadMapKit()
      .then((instance) => {
        if (!active) return;
        setMapkit(instance);
        setStatus("ready");
      })
      .catch((err: Error) => {
        if (!active) return;
        setError(err.message);
        setStatus("error");
      });

    return () => {
      active = false;
    };
  }, [enabled]);

  return { mapkit, status, error };
}
