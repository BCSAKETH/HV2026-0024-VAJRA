import { CameraView, useCameraPermissions } from "expo-camera";
import { useRef, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";

export interface CapturedPhoto {
  uri: string;
  name: string;
  type: string;
}

interface Props {
  onCaptured: (photo: CapturedPhoto) => void;
  hint?: string;
}

// Plain photo capture (bill digitization, proof-of-condition) — no barcode
// detection here, distinct mode from QrScanner even though both wrap CameraView.
export function PhotoCapture({ onCaptured, hint }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [preview, setPreview] = useState<CapturedPhoto | null>(null);
  const [capturing, setCapturing] = useState(false);

  async function handleCapture() {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      // 0.5, not 0.7 -- a modern phone camera at 0.7 JPEG quality is
      // routinely 2-4MB, which on a weak/asymmetric mobile-data uplink can
      // fail to complete the multipart upload at all (confirmed live: an
      // OCR attempt that never even reached the backend, while small JSON
      // calls succeeded fine in the same window). 0.5 is still perfectly
      // legible for OCR text extraction and roughly halves the payload.
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.5 });
      if (photo) {
        setPreview({ uri: photo.uri, name: `photo-${Date.now()}.jpg`, type: "image/jpeg" });
      }
    } finally {
      setCapturing(false);
    }
  }

  if (!permission) return <View className="flex-1 bg-navy" />;

  if (!permission.granted) {
    return (
      <View className="flex-1 items-center justify-center bg-navy px-8">
        <Text className="mb-4 text-center text-white">LOCUS needs camera access to take photos.</Text>
        <Pressable onPress={requestPermission} className="rounded-xl bg-indigo px-6 py-3">
          <Text className="font-semibold text-white">Grant Camera Access</Text>
        </Pressable>
      </View>
    );
  }

  if (preview) {
    return (
      <View className="flex-1 bg-navy">
        <Image source={{ uri: preview.uri }} className="flex-1" resizeMode="contain" />
        <View className="flex-row justify-center gap-4 bg-navy py-6">
          <Pressable onPress={() => setPreview(null)} className="rounded-xl border border-white/40 px-6 py-3">
            <Text className="font-semibold text-white">Retake</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              onCaptured(preview);
              setPreview(null);
            }}
            className="rounded-xl bg-sage px-6 py-3"
          >
            <Text className="font-semibold text-white">Use Photo</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />
      {hint ? (
        <View pointerEvents="none" className="absolute top-8 left-0 right-0 items-center">
          <Text className="rounded-full bg-navy/80 px-4 py-2 text-sm text-white">{hint}</Text>
        </View>
      ) : null}
      <View className="absolute bottom-10 left-0 right-0 items-center">
        <Pressable
          onPress={handleCapture}
          disabled={capturing}
          className="h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-orange/90"
        >
          <View className="h-14 w-14 rounded-full bg-white" />
        </Pressable>
      </View>
    </View>
  );
}
