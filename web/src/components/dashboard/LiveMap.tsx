"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer } from "react-leaflet";

import type { ActiveTransit, Bottleneck, Hub } from "@/lib/api";

function hubIcon(color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="width:14px;height:14px;border-radius:9999px;background:${color};border:2px solid white;box-shadow:0 0 0 2px ${color}55"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

const HUB_ICON = hubIcon("#172B3A"); // deep navy — static infrastructure

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

interface LiveTruck {
  bag_id: string;
  lat: number;
  lng: number;
  compromised: boolean;
}

export function LiveMap({
  hubs,
  transits,
  bottlenecks,
  compromisedBagIds,
}: {
  hubs: Hub[];
  transits: ActiveTransit[];
  bottlenecks: Bottleneck[];
  compromisedBagIds: Set<string>;
}) {
  const [now, setNow] = useState(() => Date.now());

  // Ticks truck positions forward client-side between refetches — we don't
  // get continuous GPS pings (only depart/arrive scan events), so this is an
  // honest time-based straight-line estimate, not a real live position.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const center: [number, number] = useMemo(() => {
    if (hubs.length === 0) return [17.4399, 78.3489];
    return [hubs.reduce((s, h) => s + h.gps_lat, 0) / hubs.length, hubs.reduce((s, h) => s + h.gps_lng, 0) / hubs.length];
  }, [hubs]);

  const trucks: LiveTruck[] = transits.map((t) => {
    const departedMs = new Date(t.departed_at).getTime();
    const elapsedHours = (now - departedMs) / 1000 / 3600;
    const progress = Math.max(0, Math.min(elapsedHours / t.estimated_hours, 1));
    return {
      bag_id: t.bag_id,
      lat: lerp(t.origin_hub.gps_lat, t.destination_hub.gps_lat, progress),
      lng: lerp(t.origin_hub.gps_lng, t.destination_hub.gps_lng, progress),
      compromised: compromisedBagIds.has(t.bag_id),
    };
  });

  return (
    <MapContainer center={center} zoom={11} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
      <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

      {hubs.map((hub) => (
        <Marker key={hub.id} position={[hub.gps_lat, hub.gps_lng]} icon={HUB_ICON}>
          <Popup>
            <span className="font-semibold">{hub.name}</span>
            <br />
            {hub.type}
          </Popup>
        </Marker>
      ))}

      {trucks.map((truck) => (
        <CircleMarker
          key={truck.bag_id}
          center={[truck.lat, truck.lng]}
          radius={7}
          pathOptions={{ color: truck.compromised ? "#B84A3A" : "#E76F2F", fillColor: truck.compromised ? "#B84A3A" : "#E76F2F", fillOpacity: 0.9, weight: 2 }}
        >
          <Popup>
            <span className="font-mono">{truck.bag_id}</span>
            <br />
            {truck.compromised ? "⚠ Clone attack flagged" : "In transit"}
          </Popup>
        </CircleMarker>
      ))}

      {bottlenecks.map((b) => (
        <Polyline
          key={b.bag_id}
          positions={b.polyline}
          pathOptions={{ color: "#E76F2F", weight: 3, dashArray: "6 8" }}
        />
      ))}
    </MapContainer>
  );
}
