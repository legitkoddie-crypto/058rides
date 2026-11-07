import { useEffect } from "react";
import L from "leaflet";
import { MapContainer, Marker, TileLayer, Tooltip, useMap } from "react-leaflet";

export type MapPoint = { lat: number; lng: number; id?: string | number; label?: string };
const city: MapPoint = { lat: -28.2728, lng: 29.1294 };

function MapResize() {
  const map = useMap();
  useEffect(() => {
    const resize = () => map.invalidateSize();
    const timer = window.setTimeout(resize, 100);
    const observer = new ResizeObserver(resize);
    observer.observe(map.getContainer());
    window.addEventListener("resize", resize);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [map]);
  return null;
}

function MapCenter({ point }: { point?: MapPoint | null }) {
  const map = useMap();
  useEffect(() => {
    if (point) map.flyTo([point.lat, point.lng], Math.max(map.getZoom(), 14), { duration: 0.6 });
  }, [map, point?.lat, point?.lng]);
  return null;
}

function MapBounds({ points }: { points: MapPoint[] }) {
  const map = useMap();
  const key = points.map(({ lat, lng }) => `${lat},${lng}`).join("|");
  useEffect(() => {
    if (points.length > 1) {
      map.fitBounds(points.map(({ lat, lng }) => [lat, lng]), { padding: [36, 36], maxZoom: 15 });
    } else if (points.length === 1) {
      map.flyTo([points[0].lat, points[0].lng], Math.max(map.getZoom(), 14), { duration: 0.6 });
    }
  }, [map, key]);
  return null;
}

function marker(className: string, icon: string) {
  return L.divIcon({
    className: "",
    html: `<span class="map-marker ${className}"><i class="fa-solid ${icon}"></i></span>`,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
  });
}

export default function MapView({ point, markers = [], className = "" }: { point?: MapPoint | null; markers?: MapPoint[]; className?: string }) {
  const center: [number, number] = point ? [point.lat, point.lng] : [city.lat, city.lng];
  const visiblePoints = markers.length ? markers : point ? [point] : [];
  return <div className={`map-canvas ${className}`}>
    <MapContainer center={center} zoom={14} scrollWheelZoom={false} zoomControl={false}>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <MapResize />
      <MapCenter point={point} />
      <MapBounds points={markers} />
      {visiblePoints.map((item, index) => <Marker
        key={item.id ?? `${item.lat}-${item.lng}-${index}`}
        position={[item.lat, item.lng]}
        icon={marker(index === 0 ? "pickup-marker" : "request-marker", "fa-location-dot")}
      >
        {item.label && <Tooltip>{item.label}</Tooltip>}
      </Marker>)}
    </MapContainer>
    <div className="map-live"><span className="pulse-dot" /> Harrismith</div>
    <div className="map-credit">Map data © OpenStreetMap</div>
  </div>;
}
