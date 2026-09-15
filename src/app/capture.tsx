import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from "react";
import { Alert, Image, Pressable, StyleSheet, View } from "react-native";

import { ScanArtwork } from "@/components/ScanArtwork";
import { ThemedText } from "@/components/themed-text";
import { AppButton } from "@/components/ui/AppButton";
import { AppCard } from "@/components/ui/AppCard";
import { StatusBadge } from "@/components/ui/Editorial";
import { Screen } from "@/components/ui/Screen";
import { Brand, Fonts } from "@/constants/theme";

interface SelectedPhoto {
  uri: string;
  mimeType: string;
  fileName: string;
}

const mimeByExtension: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

/** uploadMaterial validates the MIME type, so fall back to the file extension. */
function toSelectedPhoto(asset: ImagePicker.ImagePickerAsset): SelectedPhoto {
  const extension = asset.uri.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  const mimeType =
    asset.mimeType?.trim() || mimeByExtension[extension] || "image/jpeg";

  return {
    uri: asset.uri,
    mimeType,
    fileName: asset.fileName?.trim() || `photo.${extension || "jpg"}`,
  };
}

export default function CaptureScreen() {
  const {
    mode = 'photo',
    autoOpen,
  } = useLocalSearchParams<{
    mode?: 'photo' | 'video' | 'audio' | 'file';
    autoOpen?: string;
  }>();
  const [photo, setPhoto] = useState<SelectedPhoto | null>(null);
  const [busy, setBusy] = useState(false);
  const imageUri = photo?.uri ?? null;

  async function takePhoto() {
    try {
      setBusy(true);

      const permission = await ImagePicker.requestCameraPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          "Camera permission required",
          "ClassLens needs camera access so you can capture class material.",
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.9,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        setPhoto(toSelectedPhoto(result.assets[0]));
      }
    } catch {
      Alert.alert(
        "Camera unavailable",
        "ClassLens could not open the camera. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function choosePhoto() {
    try {
      setBusy(true);

      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          "Photo access required",
          "ClassLens needs access to your photo library so you can choose class material.",
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.9,
        allowsEditing: false,
        selectionLimit: 1,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        setPhoto(toSelectedPhoto(result.assets[0]));
      }
    } catch {
      Alert.alert(
        "Photos unavailable",
        "ClassLens could not open your photo library. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  function continueToProcessing() {
    if (!photo) return;

    router.push({
      pathname: "/processing",
      params: {
        imageUri: photo.uri,
        mimeType: photo.mimeType,
        fileName: photo.fileName,
      },
    });
  }

  return (
    <Screen>
      {/* This screen has a native header, so Screen's own top safe-area inset
          is counted twice. Pulling the first child up closes that dead space;
          negative margin on the first child lifts everything below it. */}
      <View style={styles.lift}>
        <StatusBadge label="01 / CAPTURE" />
      </View>

      <View style={styles.intro}>
        <ThemedText type="title" style={styles.title}>
          Big ideas.{"\n"}One little capture.
        </ThemedText>

        <ThemedText themeColor="textSecondary">
          A slide, a whiteboard, a page of notes. Start with what’s in front of
          you.
        </ThemedText>
      </View>

      {imageUri ? (
        <>
          <View style={styles.previewShell}>
            <Image
              source={{ uri: imageUri }}
              style={styles.preview}
              resizeMode="cover"
              accessibilityLabel="Selected class material"
            />

            <View style={styles.readyBadge}>
              <ThemedText style={styles.readyText}>
                ✓ READY TO ANALYZE
              </ThemedText>
            </View>
          </View>

          <AppCard>
            <StatusBadge label="MATERIAL READY" />

            <ThemedText style={styles.cardTitle}>Looks good.</ThemedText>

            <ThemedText themeColor="textSecondary">
              Continue and ClassLens will turn this material into an organized
              lecture.
            </ThemedText>

            <AppButton
              title={busy ? "Preparing…" : "Continue to analysis →"}
              disabled={busy}
              onPress={continueToProcessing}
            />

            <AppButton
              title="Retake photo"
              secondary
              disabled={busy}
              onPress={takePhoto}
            />

            <AppButton
              title="Choose another photo"
              secondary
              disabled={busy}
              onPress={choosePhoto}
            />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Remove selected photo"
              onPress={() => setPhoto(null)}
              style={({ pressed }) => [
                styles.removeButton,
                pressed && styles.pressed,
              ]}
            >
              <ThemedText style={styles.removeText}>Remove photo</ThemedText>
            </Pressable>
          </AppCard>
        </>
      ) : (
        <>
          <View style={styles.scan}>
            <ScanArtwork />

            <ThemedText style={styles.scanLabel}>
              FRAME THE IDEA. FIND THE CLARITY.
            </ThemedText>
          </View>

          <AppButton
            title={busy ? "Opening camera…" : "Take Photo"}
            disabled={busy}
            onPress={takePhoto}
            accessibilityHint="Opens the device camera"
          />

          <AppButton
            title={busy ? "Opening photos…" : "Choose Photo"}
            secondary
            disabled={busy}
            onPress={choosePhoto}
            accessibilityHint="Opens the photo library"
          />

          <AppCard>
            <StatusBadge label="CAPTURE TIPS" />

            <ThemedText style={styles.cardTitle}>
              Give ClassLens a clear view.
            </ThemedText>

            <ThemedText themeColor="textSecondary">
              Slides, whiteboards, handwritten notes, diagrams, and textbook
              pages all work best when they are well lit and fully visible.
            </ThemedText>
          </AppCard>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  lift: {
    marginTop: -100,
  },

  intro: {
    gap: 16,
  },

  title: {
    fontFamily: Fonts.serif,
    fontWeight: "400",
    letterSpacing: -1,
  },

  scan: {
    backgroundColor: Brand.forest,
    borderRadius: 24,
    padding: 16,
    gap: 8,
  },

  scanLabel: {
    color: Brand.muted,
    textAlign: "center",
    fontSize: 10,
    letterSpacing: 1,
    paddingBottom: 8,
  },

  previewShell: {
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: Brand.forest,
    minHeight: 380,
    position: "relative",
  },

  preview: {
    width: "100%",
    height: 420,
  },

  readyBadge: {
    position: "absolute",
    left: 16,
    bottom: 16,
    backgroundColor: Brand.lime,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },

  readyText: {
    color: Brand.ink,
    fontWeight: "700",
    fontSize: 11,
    letterSpacing: 1,
  },

  cardTitle: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: "500",
  },

  removeButton: {
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
  },

  removeText: {
    color: "#A14E4E",
    fontWeight: "600",
  },

  pressed: {
    opacity: 0.55,
  },
});
