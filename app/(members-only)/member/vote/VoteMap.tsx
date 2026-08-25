"use client";

import * as React from "react";
import { Loader2, MapPin, MapPinOff } from "lucide-react";

import { cn } from "@/lib/utils";
import { useTheme } from "../../components/ThemeProvider";

import { useMapKit } from "./useMapKit";
import type { BallotPoint, VotingAnchor } from "./types";

/**
 * The two Apple Maps views the voting page needs: one for choosing where a
 * vote is held, one for showing where its ballots came from.
 *
 * Both are thin wrappers over MapKit JS, which is an imperative library with
 * its own lifecycle — so the map instance lives in a ref and React only ever
 * pushes changes into it. Rebuilding the map on every render would throw away
 * the camera the officer just panned.
 */

function useColorScheme(): "Light" | "Dark" {
  const { resolvedTheme } = useTheme();
  return resolvedTheme === "dark" ? "Dark" : "Light";
}

/** The shell every map sits in, including when there is no map to show. */
function MapFrame({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border bg-muted",
        className
      )}
    >
      {children}
    </div>
  );
}

function MapUnavailable({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <MapPinOff className="size-6 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium">Map unavailable</p>
      <p className="max-w-xs text-xs text-muted-foreground">{message}</p>
    </div>
  );
}

function MapLoading() {
  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
    </div>
  );
}

// MARK: - Picker

/**
 * A fixed crosshair over a map that moves under it.
 *
 * The standard way to pick a point, and the right one here: a draggable pin
 * needs a target big enough to grab, which is the same thing as being
 * imprecise about the very number this control exists to set.
 */
export function AnchorPicker({
  centre,
  radiusMeters,
  onCentreChange,
  className,
}: {
  centre: { lat: number; lng: number } | null;
  radiusMeters: number;
  onCentreChange: (centre: { lat: number; lng: number }) => void;
  className?: string;
}) {
  const { mapkit, status, error } = useMapKit();
  const colorScheme = useColorScheme();
  const container = React.useRef<HTMLDivElement>(null);
  const map = React.useRef<any>(null);
  const circle = React.useRef<any>(null);
  const onCentreChangeRef = React.useRef(onCentreChange);
  onCentreChangeRef.current = onCentreChange;

  // The camera is only ever *pushed* from props on the first build and when
  // the caller jumps it somewhere new (Use where I am now). Panning the map
  // must not feed back into a re-centre, or the map fights the thumb.
  const lastPushed = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (status !== "ready" || !mapkit || !container.current || map.current) return;

    const instance = new mapkit.Map(container.current, {
      showsMapTypeControl: false,
      showsCompass: mapkit.FeatureVisibility.Hidden,
      showsScale: mapkit.FeatureVisibility.Adaptive,
      showsPointsOfInterest: true,
      colorScheme: mapkit.Map.ColorSchemes[colorScheme],
      isRotationEnabled: false,
    });

    instance.addEventListener("region-change-end", () => {
      const next = { lat: instance.center.latitude, lng: instance.center.longitude };
      lastPushed.current = `${next.lat.toFixed(6)},${next.lng.toFixed(6)}`;
      onCentreChangeRef.current(next);
    });

    map.current = instance;

    return () => {
      instance.destroy();
      map.current = null;
      circle.current = null;
    };
    // colorScheme is applied by its own effect; rebuilding for it would drop
    // the camera every time somebody toggles the theme.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, mapkit]);

  React.useEffect(() => {
    if (!map.current || !mapkit) return;
    map.current.colorScheme = mapkit.Map.ColorSchemes[colorScheme];
  }, [colorScheme, mapkit]);

  // Jump the camera when the caller moves the point somewhere the map isn't.
  React.useEffect(() => {
    if (!map.current || !mapkit || !centre) return;
    const key = `${centre.lat.toFixed(6)},${centre.lng.toFixed(6)}`;
    if (key === lastPushed.current) return;
    lastPushed.current = key;
    map.current.setRegionAnimated(
      new mapkit.CoordinateRegion(
        new mapkit.Coordinate(centre.lat, centre.lng),
        new mapkit.CoordinateSpan(0.006, 0.006)
      ),
      true
    );
  }, [centre, mapkit]);

  // The tolerance, drawn to scale rather than described. Somebody choosing
  // between 200 m and 500 m can see what each one covers.
  React.useEffect(() => {
    if (!map.current || !mapkit || !centre) return;
    if (circle.current) map.current.removeOverlay(circle.current);
    const overlay = new mapkit.CircleOverlay(
      new mapkit.Coordinate(centre.lat, centre.lng),
      radiusMeters,
      {
        style: new mapkit.Style({
          strokeColor: "#8c1d40",
          strokeOpacity: 0.8,
          lineWidth: 1.5,
          fillColor: "#8c1d40",
          fillOpacity: 0.14,
        }),
      }
    );
    map.current.addOverlay(overlay);
    circle.current = overlay;
  }, [centre, radiusMeters, mapkit]);

  return (
    <MapFrame className={cn("h-64", className)}>
      {status === "error" ? (
        <MapUnavailable message={error ?? "Apple Maps could not be loaded."} />
      ) : (
        <>
          <div
            ref={container}
            className="size-full"
            role="application"
            aria-label="Map. Drag to place the meeting location under the pin."
          />
          {status === "loading" ? (
            <div className="absolute inset-0 bg-background">
              <MapLoading />
            </div>
          ) : (
            <MapPin
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-1/2 size-8 -translate-x-1/2 -translate-y-full text-primary drop-shadow"
              fill="currentColor"
            />
          )}
        </>
      )}
    </MapFrame>
  );
}

// MARK: - Ballot map

/**
 * Where a vote's ballots came from, with nobody's name on any of it.
 *
 * Every point here is unattributable by construction on the server: the
 * records live in their own collection, carry no member reference, have random
 * identifiers rather than time-ordered ones, and are read back shuffled.
 */
export function BallotMap({
  anchor,
  points,
  className,
}: {
  anchor: VotingAnchor | null;
  points: BallotPoint[];
  className?: string;
}) {
  const { mapkit, status, error } = useMapKit();
  const colorScheme = useColorScheme();
  const container = React.useRef<HTMLDivElement>(null);
  const map = React.useRef<any>(null);

  React.useEffect(() => {
    if (status !== "ready" || !mapkit || !container.current || map.current) return;

    map.current = new mapkit.Map(container.current, {
      showsMapTypeControl: false,
      showsCompass: mapkit.FeatureVisibility.Hidden,
      showsPointsOfInterest: false,
      colorScheme: mapkit.Map.ColorSchemes[colorScheme],
    });

    return () => {
      map.current?.destroy();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, mapkit]);

  React.useEffect(() => {
    if (!map.current || !mapkit) return;
    map.current.colorScheme = mapkit.Map.ColorSchemes[colorScheme];
  }, [colorScheme, mapkit]);

  React.useEffect(() => {
    const instance = map.current;
    if (!instance || !mapkit) return;

    instance.removeAnnotations(instance.annotations ?? []);
    instance.removeOverlays(instance.overlays ?? []);

    if (anchor) {
      instance.addOverlay(
        new mapkit.CircleOverlay(
          new mapkit.Coordinate(anchor.lat, anchor.lng),
          anchor.radiusMeters,
          {
            style: new mapkit.Style({
              strokeColor: "#8c1d40",
              strokeOpacity: 0.8,
              lineWidth: 1.5,
              fillColor: "#8c1d40",
              fillOpacity: 0.12,
            }),
          }
        )
      );
      instance.addAnnotation(
        new mapkit.MarkerAnnotation(
          new mapkit.Coordinate(anchor.lat, anchor.lng),
          {
            color: "#8c1d40",
            glyphText: "★",
            title: anchor.label || "Meeting location",
          }
        )
      );
    }

    // Colour *and* glyph carry the meaning, so the three kinds stay apart in
    // greyscale.
    for (const point of points) {
      const [color, glyph, title] = point.flagged
        ? ["#dc2626", "!", "Flagged ballot"]
        : point.proxy
        ? ["#2563eb", "P", "Proxy ballot"]
        : ["#047857", "✓", "Ballot at the meeting"];

      instance.addAnnotation(
        new mapkit.MarkerAnnotation(new mapkit.Coordinate(point.lat, point.lng), {
          color,
          glyphText: glyph,
          title,
        })
      );
    }

    // A camera that holds the anchor and every ballot at once, with a floor on
    // the span so one point does not zoom to the pavement.
    const coordinates = points.map((p) => ({ lat: p.lat, lng: p.lng }));
    if (anchor) coordinates.push({ lat: anchor.lat, lng: anchor.lng });
    if (!coordinates.length) return;

    const lats = coordinates.map((c) => c.lat);
    const lngs = coordinates.map((c) => c.lng);
    const anchorSpan = ((anchor?.radiusMeters ?? 200) / 111_000) * 4;

    instance.region = new mapkit.CoordinateRegion(
      new mapkit.Coordinate(
        (Math.min(...lats) + Math.max(...lats)) / 2,
        (Math.min(...lngs) + Math.max(...lngs)) / 2
      ),
      new mapkit.CoordinateSpan(
        Math.max((Math.max(...lats) - Math.min(...lats)) * 1.6, anchorSpan, 0.004),
        Math.max((Math.max(...lngs) - Math.min(...lngs)) * 1.6, anchorSpan, 0.004)
      )
    );
  }, [anchor, points, mapkit, status]);

  return (
    <MapFrame className={cn("h-80", className)}>
      {status === "error" ? (
        <MapUnavailable message={error ?? "Apple Maps could not be loaded."} />
      ) : (
        <>
          <div
            ref={container}
            className="size-full"
            role="img"
            aria-label={`Map of ${points.length} ballot locations`}
          />
          {status === "loading" ? (
            <div className="absolute inset-0 bg-background">
              <MapLoading />
            </div>
          ) : null}
        </>
      )}
    </MapFrame>
  );
}

/** The key under a ballot map. */
export function MapLegend() {
  const items = [
    { color: "bg-emerald-700 dark:bg-emerald-500", label: "At the meeting" },
    { color: "bg-blue-600", label: "Proxy" },
    { color: "bg-destructive", label: "Flagged" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={cn("size-2.5 rounded-full", item.color)} aria-hidden="true" />
          {item.label}
        </span>
      ))}
    </div>
  );
}
