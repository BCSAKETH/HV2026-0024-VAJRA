import * as Location from "expo-location";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Linking, Pressable, Text, TextInput, View } from "react-native";

import { PhotoCapture, type CapturedPhoto } from "../../../components/PhotoCapture";
import { ApiError, api, type Shipment } from "../../../lib/api";
import { haversineMeters } from "../../../lib/geo";

const GEOFENCE_METERS = 100;

export default function DeliverScreen() {
  const { trackingId } = useLocalSearchParams<{ trackingId: string }>();
  const router = useRouter();

  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const watchRef = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    api.getShipment(trackingId).then(setShipment);
  }, [trackingId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted" || cancelled) return;
      watchRef.current = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 5 }, (loc) => {
        setPosition({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      });
    })();
    return () => {
      cancelled = true;
      watchRef.current?.remove();
    };
  }, []);

  useEffect(() => {
    if (!shipment || !position || shipment.delivery_lat === null || shipment.delivery_lng === null) {
      setDistance(null);
      return;
    }
    setDistance(haversineMeters(shipment.delivery_lat, shipment.delivery_lng, position.lat, position.lng));
  }, [shipment, position]);

  if (!shipment) {
    return (
      <View className="flex-1 items-center justify-center bg-ivory">
        <ActivityIndicator color="#4F46E5" size="large" />
      </View>
    );
  }

  if (showCamera) {
    return (
      <PhotoCapture
        onCaptured={(p) => {
          setPhoto(p);
          setShowCamera(false);
        }}
        hint={`${shipment.tracking_id} — Photograph the delivered package`}
      />
    );
  }

  // Defense 9: no address coordinates on file means no geofence to enforce —
  // the "Call Recipient" fallback is what covers that case, not a hard lock.
  const hasTarget = shipment.delivery_lat !== null && shipment.delivery_lng !== null;
  const withinGeofence = !hasTarget || (distance !== null && distance <= GEOFENCE_METERS);

  async function handleDeliver() {
    setBusy(true);
    setError(null);
    try {
      await api.deliverShipment(trackingId, otp, position?.lat, position?.lng, photo?.base64);
      router.replace("/lastmile/manifest");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not confirm delivery.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRto() {
    setBusy(true);
    setError(null);
    try {
      await api.rtoShipment(trackingId, "Recipient unavailable", position?.lat, position?.lng);
      router.replace("/lastmile/manifest");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not mark this attempted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="flex-1 bg-ivory p-6 pt-16">
      <Text className="font-mono text-xs uppercase tracking-widest text-orange">{shipment.tracking_id}</Text>
      <Text className="mb-1 text-2xl text-navy" style={{ fontFamily: "serif" }}>
        {shipment.recipient_name ?? "Unnamed recipient"}
      </Text>
      <Text className="mb-6 text-navy/60">{shipment.delivery_address ?? shipment.delivery_pincode}</Text>

      <View className="mb-6 rounded-card border border-navy/10 bg-white p-5">
        {hasTarget ? (
          <>
            <Text className="text-sm text-navy/50">Distance to delivery address</Text>
            <Text className={`font-mono text-3xl ${withinGeofence ? "text-sage" : "text-brick"}`}>
              {distance === null ? "…" : distance < 1000 ? `${distance.toFixed(0)} m` : `${(distance / 1000).toFixed(2)} km`}
            </Text>
            {!withinGeofence ? <Text className="mt-1 text-brick">Get within {GEOFENCE_METERS}m to unlock delivery</Text> : <Text className="mt-1 text-sage">Within range</Text>}
          </>
        ) : (
          <Text className="text-brick">No GPS on file for this address — call the recipient to confirm location.</Text>
        )}
      </View>

      {shipment.recipient_phone ? (
        <Pressable onPress={() => Linking.openURL(`tel:${shipment.recipient_phone}`)} className="mb-6 items-center rounded-xl border border-navy/20 py-3">
          <Text className="font-semibold text-navy">Call Recipient</Text>
        </Pressable>
      ) : null}

      <Text className="mb-1 text-sm font-medium text-navy">Customer OTP</Text>
      <TextInput
        value={otp}
        onChangeText={setOtp}
        editable={withinGeofence}
        keyboardType="number-pad"
        maxLength={4}
        placeholder={withinGeofence ? "0000" : "Locked — get closer"}
        className={`mb-4 rounded-xl border px-4 py-3 text-center font-mono text-2xl tracking-widest ${withinGeofence ? "border-navy/15 bg-white text-navy" : "border-navy/10 bg-navy/5 text-navy/30"}`}
      />

      <Text className="mb-1 text-sm font-medium text-navy">Proof of delivery</Text>
      {photo ? (
        <Pressable onPress={() => setShowCamera(true)} className="mb-4 flex-row items-center gap-3">
          <Image source={{ uri: photo.uri }} className="h-16 w-16 rounded-xl border border-navy/15" />
          <Text className="text-sm text-indigo">Retake photo</Text>
        </Pressable>
      ) : (
        <Pressable
          disabled={!withinGeofence}
          onPress={() => setShowCamera(true)}
          className="mb-4 items-center rounded-xl border border-dashed border-navy/25 py-3.5 disabled:opacity-40"
        >
          <Text className="font-semibold text-navy">Take Delivery Photo</Text>
        </Pressable>
      )}

      {error ? <Text className="mb-4 text-brick">{error}</Text> : null}

      <Pressable
        disabled={!withinGeofence || otp.length !== 4 || !photo || busy}
        onPress={handleDeliver}
        className="mb-3 items-center rounded-xl bg-sage py-3.5 disabled:opacity-40"
      >
        {busy ? <ActivityIndicator color="white" /> : <Text className="font-semibold text-white">Mark Delivered</Text>}
      </Pressable>
      <Pressable disabled={!withinGeofence || busy} onPress={handleRto} className="items-center rounded-xl border border-brick py-3.5 disabled:opacity-40">
        <Text className="font-semibold text-brick">Attempted — RTO</Text>
      </Pressable>
    </View>
  );
}
