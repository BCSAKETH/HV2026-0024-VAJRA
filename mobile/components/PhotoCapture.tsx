import { CameraView, useCameraPermissions } from "expo-camera";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { useRef, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";

// Empirically confirmed against the live backend: Vercel's serverless
// function body limit rejects uploads above ~4.5MB outright (413), and a
// weak connection can drop the upload mid-transfer before that even
// happens, which looks identical to a generic "could not reach server"
// error on the client. JPEG quality alone doesn't reliably keep a modern
// phone camera's actual pixel dimensions under any size budget -- a high
// native resolution at low quality can still land multiple MB. Capping
// the longest edge at 1600px is what actually bounds the file size; a
// bill/parcel photo doesn't need more resolution than that to stay fully
// legible for OCR or condition-proof review.
const MAX_DIMENSION = 1200;

export interface CapturedPhoto {
  uri: string;
  name: string;
  type: string;
  base64?: string;
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
    let photo: { uri: string; width?: number; height?: number; base64?: string } | undefined;
    try {
      photo = await cameraRef.current.takePictureAsync({ quality: 0.7, base64: true });
      if (!photo) return;

      // Resize (not just compress) before it ever gets near the network --
      // see MAX_DIMENSION comment above for why quality alone wasn't enough.
      const context = ImageManipulator.manipulate(photo.uri);
      const isLandscape = (photo.width ?? 0) >= (photo.height ?? 0);
      context.resize(isLandscape ? { width: MAX_DIMENSION, height: null } : { width: null, height: MAX_DIMENSION });
      const rendered = await context.renderAsync();
      const resized = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.4, base64: true });

      setPreview({ uri: resized.uri, base64: resized.base64 ?? photo.base64, name: `photo-${Date.now()}.jpg`, type: "image/jpeg" });
    } catch {
      // If resizing itself fails for any reason, fall back to the original
      // capture already in hand rather than losing the photo or firing the
      // shutter a second time -- still functional, just without the size
      // guarantee that resize would have added.
      if (photo) setPreview({ uri: photo.uri, base64: photo.base64, name: `photo-${Date.now()}.jpg`, type: "image/jpeg" });
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
