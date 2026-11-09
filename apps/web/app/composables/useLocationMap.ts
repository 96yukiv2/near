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

  async function initialize(container: HTMLElement) {
    const maplibre = await import("maplibre-gl");
    if (disposed) return;
    const rasterStyle: Exclude<
      NonNullable<ConstructorParameters<typeof maplibre.Map>[0]["style"]>,
      string
    > = {
      version: 8,
      sources: {
        osm: {
          type: "raster",
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
          type: "raster",
          source: "osm",
          paint: {
            "raster-saturation": -0.32,
            "raster-contrast": -0.13,
            "raster-brightness-min": 0.06,
          },
        },
      ],
    };
    const configuredStyle = useRuntimeConfig().public.mapStyleUrl;
    const styleUrl =
      typeof configuredStyle === "string" &&
      configuredStyle.startsWith("https://")
        ? configuredStyle
        : "";
    let usingRaster = !styleUrl;
    map = new maplibre.Map({
      container,
      style: styleUrl || rasterStyle,
      center: [139.7, 35.66],
      zoom: 4,
      attributionControl: false,
    });
    map.on("error", () => {
      // Fall back if the vector style itself is unavailable. Tile errors after
      // the style loads should not unexpectedly change the map underneath users.
      if (!map || usingRaster || map.isStyleLoaded()) return;
      usingRaster = true;
      map.setStyle(rasterStyle);
    });
    map.on("style.load", () => {
      if (!map || usingRaster) return;
      // Hide small POIs and street labels so the map stays legible on phones.
      for (const layer of map.getStyle().layers ?? []) {
        if (
          /^(poi-|label-street-|symbol-transit-|marking-oneway)/.test(layer.id)
        ) {
          map.removeLayer(layer.id);
        }
      }
      const colors: Record<string, string> = {
        background: "#f8f5e9",
        "water-ocean": "#b9e5f3",
        "water-area": "#b9e5f3",
        "water-area-river": "#b9e5f3",
        "water-area-small": "#b9e5f3",
        "land-park": "#ccebc4",
        "land-grass": "#dcefd2",
        building: "#f1ded1",
      };
      for (const [id, color] of Object.entries(colors)) {
        const layer = map.getLayer(id);
        if (layer?.type === "fill")
          map.setPaintProperty(id, "fill-color", color);
        if (layer?.type === "background")
          map.setPaintProperty(id, "background-color", color);
      }
    });
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
