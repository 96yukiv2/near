import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";

export type MapLocation = {
  id: string;
  name: string;
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
    map = new maplibre.Map({
      container,
      style: {
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
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
      center: [139.7, 35.66],
      zoom: 4,
      attributionControl: false,
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
      element.style.setProperty(
        "--marker-color",
        location.id === ownId ? "#82b993" : "#ffad91",
      );
      element.textContent = Array.from(location.name)[0] ?? "•";
      element.setAttribute("aria-label", `${location.name}の位置`);
      element.addEventListener("click", () =>
        map?.flyTo({
          center: [location.longitude, location.latitude],
          zoom: 12,
        }),
      );
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
  function destroy() {
    disposed = true;
    clear();
    map?.remove();
    map = undefined;
  }
  return { initialize, render, clear, destroy };
}
