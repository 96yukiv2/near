import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import { getProfileIcon } from "../utils/profile-icon";

export type MapLocation = {
  id: string;
  name: string;
  icon?: string;
  latitude: number;
  longitude: number;
  accuracy_m: number;
  updated_at: string;
};

export function useLocationMap() {
  let map: MapLibreMap | undefined;
  let markers: MapLibreMarker[] = [];
  let centered = false;
  let disposed = false;
  let renderGeneration = 0;

  async function initialize(container: HTMLElement, styleUrl = "") {
    const maplibre = await import("maplibre-gl");
    if (disposed) return;
    const fallbackStyle = {
      version: 8 as const,
      sources: {
        osm: {
          type: "raster" as const,
          tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution:
            '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
          maxzoom: 19,
        },
      },
      layers: [
        {
          id: "osm",
          type: "raster" as const,
          source: "osm",
          paint: {
            "raster-saturation": -0.32,
            "raster-contrast": -0.13,
            "raster-brightness-min": 0.06,
          },
        },
      ],
    };
    let remoteStyle = "";
    try {
      const parsed = new URL(styleUrl);
      if (parsed.protocol === "https:") remoteStyle = parsed.href;
    } catch {
      // Empty or invalid configuration keeps the standard map.
    }
    map = new maplibre.Map({
      container,
      style: remoteStyle || fallbackStyle,
      center: [139.7, 35.66],
      zoom: 4,
      attributionControl: false,
    });
    if (remoteStyle) {
      let fallbackApplied = false;
      map.on("error", () => {
        if (!fallbackApplied && map && !map.isStyleLoaded()) {
          fallbackApplied = true;
          map.setStyle(fallbackStyle);
        }
      });
    }
    map.addControl(
      new maplibre.AttributionControl({ compact: false }),
      "bottom-right",
    );
    map.addControl(
      new maplibre.NavigationControl({ showCompass: false }),
      "bottom-right",
    );
  }
  function clear() {
    renderGeneration++;
    centered = false;
    for (const marker of markers) marker.remove();
    markers = [];
  }
  async function render(locations: MapLocation[], ownId: string) {
    if (!map) return;
    const generation = ++renderGeneration;
    const maplibre = await import("maplibre-gl");
    if (!map || disposed || generation !== renderGeneration) return;
    for (const marker of markers) marker.remove();
    markers = locations.map((location) => {
      const element = document.createElement("button");
      element.className = "map-marker";
      const icon = getProfileIcon(location.icon);
      element.style.setProperty("--marker-color", icon.color);
      element.textContent = icon.symbol;
      if (location.id === ownId) element.classList.add("own-marker");
      element.setAttribute("aria-label", `${location.name}の位置`);
      element.addEventListener("click", () => focus(location));
      return new maplibre.Marker({ element })
        .setLngLat([location.longitude, location.latitude])
        .addTo(map!);
    });
    if (!centered && locations.length) {
      centered = true;
      const bounds = new maplibre.LngLatBounds();
      for (const item of locations)
        bounds.extend([item.longitude, item.latitude]);
      map.fitBounds(bounds, { padding: 80, maxZoom: 13, duration: 0 });
    }
  }
  function focus(location: MapLocation) {
    if (
      !map ||
      !Number.isFinite(location.longitude) ||
      !Number.isFinite(location.latitude)
    )
      return;
    map.flyTo({
      center: [location.longitude, location.latitude],
      zoom: Math.max(map.getZoom(), 12),
      duration: 1300,
      essential: false,
    });
  }
  function destroy() {
    disposed = true;
    clear();
    map?.remove();
    map = undefined;
  }
  return { initialize, render, focus, clear, destroy };
}
