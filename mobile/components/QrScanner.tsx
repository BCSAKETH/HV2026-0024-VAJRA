import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

interface Props {
  onScan: (rawCode: string) => void;
  active?: boolean; // pause detection while a drawer/modal is on top
  hint?: string;
  accentColor?: string; // bounding box + viewfinder — burnt orange by default (active scan)
}

interface TrackedBox {
  code: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// Box position expiry — onBarcodeScanned only fires while a code is actually
// detected in frame, so once it stops firing (QR left frame) we clear the
// box shortly after rather than leaving it frozen in its last spot.
const BOX_EXPIRY_MS = 350;

// Shared by Intake, Consolidation and (later) Line-Haul/Last-Mile screens.
// Every scan-capable screen in LOCUS looks and behaves the same way.
export function QrScanner({ onScan, active = true, hint, accentColor = "#E76F2F" }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const lastScanRef = useRef<{ code: string; at: number } | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [box, setBox] = useState<TrackedBox | null>(null);
  const boxExpiryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (boxExpiryRef.current) clearTimeout(boxExpiryRef.current);
  }, []);

  function handleBarcodeScanned(result: BarcodeScanningResult) {
    if (!active) return;

    // expo-camera reports bounds already adjusted to the CameraView's own
    // rendered dimensions, so these map straight onto an absolutely
    // positioned overlay with no extra scaling math needed.
    if (result.bounds && result.bounds.size.width > 0) {
      setBox({ code: result.data, x: result.bounds.origin.x, y: result.bounds.origin.y, width: result.bounds.size.width, height: result.bounds.size.height });
      if (boxExpiryRef.current) clearTimeout(boxExpiryRef.current);
      boxExpiryRef.current = setTimeout(() => setBox(null), BOX_EXPIRY_MS);
    }

    const now = Date.now();
    const { data } = result;
    if (lastScanRef.current && lastScanRef.current.code === data && now - lastScanRef.current.at < 2500) {
      return; // debounce repeat frames of the same code while it's still in view
    }
    lastScanRef.current = { code: data, at: now };
    onScan(data);
  }

  function submitManualCode() {
    if (manualCode.trim().length < 4) return;
    onScan(manualCode.trim());
    setManualCode("");
  }

  if (!permission) return <View className="flex-1 bg-navy" />;

  if (!permission.granted) {
    return (
      <View className="flex-1 items-center justify-center bg-navy px-8">
        <Text className="mb-4 text-center text-white">LOCUS needs camera access to scan QR codes.</Text>
        <Pressable onPress={requestPermission} className="rounded-xl bg-indigo px-6 py-3">
          <Text className="font-semibold text-white">Grant Camera Access</Text>
        </Pressable>
      </View>
    );
  }

  if (manualMode) {
    return (
      <View className="flex-1 items-center justify-center bg-navy px-8">
        <Text className="mb-3 text-center text-white">Enter the code printed below the QR</Text>
        <TextInput
          value={manualCode}
          onChangeText={(t) => setManualCode(t.toUpperCase())}
          autoCapitalize="characters"
          maxLength={10}
          placeholder="A1B2C3"
          placeholderTextColor="#ffffff80"
          className="mb-4 w-48 rounded-xl border border-white/30 px-4 py-3 text-center text-2xl tracking-widest text-white"
        />
        <Pressable onPress={submitManualCode} className="mb-3 rounded-xl bg-indigo px-6 py-3">
          <Text className="font-semibold text-white">Submit Code</Text>
        </Pressable>
        <Pressable onPress={() => setManualMode(false)}>
          <Text className="text-white/60">Back to camera</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={active ? handleBarcodeScanned : undefined}
      />
      {box ? (
        // Real per-frame bounding box, tracking the detected QR's actual position.
        <View
          pointerEvents="none"
          style={{ position: "absolute", left: box.x, top: box.y, width: box.width, height: box.height, borderColor: accentColor }}
          className="rounded-lg border-4"
        />
      ) : (
        // No QR in frame yet — a static, low-opacity guide to aim at.
        <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
          <View style={{ borderColor: accentColor }} className="h-56 w-56 rounded-2xl border-2 opacity-40" />
        </View>
      )}
      {hint ? (
        <View pointerEvents="none" className="absolute bottom-28 left-0 right-0 items-center">
          <Text className="rounded-full bg-navy/80 px-4 py-2 text-sm text-white">{hint}</Text>
        </View>
      ) : null}
      <Pressable onPress={() => setManualMode(true)} className="absolute bottom-10 left-0 right-0 items-center">
        <Text className="rounded-full bg-white/90 px-5 py-2 font-medium text-navy">Enter code manually</Text>
      </Pressable>
    </View>
  );
}
