import { CameraView, useCameraPermissions, type CameraCapturedPicture } from 'expo-camera';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Brand } from '@/constants/theme';
import {
  MAX_CAPTURE_PHOTOS,
  serializeCaptureSession,
  type CaptureSession,
  type CaptureSessionPhoto,
} from '@/features/capture/captureSession';

function photoFromCamera(picture: CameraCapturedPicture, sequence: number): CaptureSessionPhoto {
  const capturedAt = new Date().toISOString();
  const format = picture.format === 'png' ? 'png' : 'jpg';
  return {
    id: `${Date.now()}-${sequence}`,
    uri: picture.uri,
    width: picture.width,
    height: picture.height,
    mimeType: format === 'png' ? 'image/png' : 'image/jpeg',
    fileName: `classlens-${sequence}.${format}`,
    capturedAt,
  };
}

export default function CaptureScreen() {
  const camera = useRef<CameraView>(null);
  const requestedPermission = useRef(false);
  const sequence = useRef(0);
  const pending = useRef(0);
  const sessionId = useRef(`capture-${Date.now()}`);
  const sessionCreatedAt = useRef(new Date().toISOString());

  const [permission, requestPermission] = useCameraPermissions();
  const [requestingPermission, setRequestingPermission] = useState(false);
  const [photos, setPhotos] = useState<CaptureSessionPhoto[]>([]);
  const [preview, setPreview] = useState<CaptureSessionPhoto | null>(null);
  const [taking, setTaking] = useState(false);
  const [focused, setFocused] = useState(true);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [cameraKey, setCameraKey] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  useEffect(() => {
    if (!permission || permission.granted || !permission.canAskAgain || requestedPermission.current) return;
    requestedPermission.current = true;
    setRequestingPermission(true);
    void requestPermission().finally(() => setRequestingPermission(false));
  }, [permission, requestPermission]);

  function savePicture(picture: CameraCapturedPicture) {
    pending.current = Math.max(0, pending.current - 1);
    sequence.current += 1;
    setPhotos((current) => {
      if (current.length >= MAX_CAPTURE_PHOTOS) return current;
      return [...current, photoFromCamera(picture, sequence.current)];
    });
  }

  async function takePhoto() {
    if (!camera.current || !cameraReady || taking || photos.length + pending.current >= MAX_CAPTURE_PHOTOS) return;
    setTaking(true);
    setCameraError('');
    pending.current += 1;
    try {
      await camera.current.takePictureAsync({
        quality: 0.9,
        onPictureSaved: savePicture,
      });
    } catch (caught) {
      pending.current = Math.max(0, pending.current - 1);
      setCameraError(caught instanceof Error ? caught.message : 'ClassLens could not take that photo. Try again.');
    } finally {
      setTaking(false);
    }
  }

  function removePhoto(photoId: string) {
    setPhotos((current) => current.filter((photo) => photo.id !== photoId));
    setPreview((current) => current?.id === photoId ? null : current);
  }

  function retryCamera() {
    setCameraError('');
    setCameraReady(false);
    setCameraKey((current) => current + 1);
  }

  function finishSession() {
    if (!photos.length) return;
    const session: CaptureSession = {
      version: 1,
      id: sessionId.current,
      createdAt: sessionCreatedAt.current,
      photos,
    };
    router.push({
      pathname: '/processing',
      params: { captureSession: serializeCaptureSession(session) },
    });
  }

  if (!permission || requestingPermission) {
    return <PermissionState loading />;
  }

  if (!permission.granted) {
    return (
      <PermissionState
        title="Camera access is off."
        body="ClassLens needs camera access to capture slides, notes, and whiteboards."
        action={permission.canAskAgain ? 'Try camera permission again' : 'Open Settings'}
        onPress={permission.canAskAgain ? requestPermission : Linking.openSettings}
      />
    );
  }

  const atLimit = photos.length + pending.current >= MAX_CAPTURE_PHOTOS;

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safe}>
      <View style={styles.cameraShell}>
        <CameraView
          key={cameraKey}
          ref={camera}
          style={StyleSheet.absoluteFill}
          facing="back"
          mode="picture"
          active={focused && !preview}
          onCameraReady={() => {
            setCameraReady(true);
            setCameraError('');
          }}
          onMountError={(event) => setCameraError(event.message)}
        />

        <View pointerEvents="none" style={styles.topScrim} />
        <View style={styles.topBar}>
          <View>
            <ThemedText style={styles.eyebrow}>RAPID CAPTURE</ThemedText>
            <ThemedText style={styles.counter}>{photos.length} / {MAX_CAPTURE_PHOTOS} photos</ThemedText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Done with ${photos.length} photos`}
            accessibilityState={{ disabled: photos.length === 0 }}
            disabled={photos.length === 0}
            onPress={finishSession}
            style={({ pressed }) => [styles.done, (pressed || photos.length === 0) && styles.dim]}
          >
            <ThemedText style={styles.doneText}>Done</ThemedText>
          </Pressable>
        </View>

        <View style={styles.guide} pointerEvents="none">
          <View style={[styles.corner, styles.topLeft]} />
          <View style={[styles.corner, styles.topRight]} />
          <View style={[styles.corner, styles.bottomLeft]} />
          <View style={[styles.corner, styles.bottomRight]} />
        </View>

        <View style={styles.bottomPanel}>
          {cameraError ? (
            <View accessibilityLiveRegion="polite" style={styles.errorCard}>
              <ThemedText style={styles.errorTitle}>Camera paused</ThemedText>
              <ThemedText style={styles.errorBody}>{cameraError}</ThemedText>
              <Pressable accessibilityRole="button" onPress={retryCamera} style={styles.retryButton}>
                <ThemedText style={styles.retryText}>Retry camera</ThemedText>
              </Pressable>
            </View>
          ) : null}

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.thumbnails}
            accessibilityLabel="Captured photos"
          >
            {photos.map((photo, index) => (
              <Pressable
                key={photo.id}
                accessibilityRole="button"
                accessibilityLabel={`Preview photo ${index + 1}`}
                onPress={() => setPreview(photo)}
                style={({ pressed }) => [styles.thumbnailButton, pressed && styles.dim]}
              >
                <Image source={{ uri: photo.uri }} style={styles.thumbnail} />
                <View style={styles.thumbnailNumber}>
                  <ThemedText style={styles.thumbnailNumberText}>{index + 1}</ThemedText>
                </View>
              </Pressable>
            ))}
            {photos.length === 0 ? (
              <ThemedText style={styles.emptyStrip}>Captured pages will appear here.</ThemedText>
            ) : null}
          </ScrollView>

          <View style={styles.shutterRow}>
            <View style={styles.shutterSide}>
              <ThemedText style={styles.limitText}>{atLimit ? 'Six-photo limit reached' : 'Camera stays ready'}</ThemedText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={atLimit ? 'Six-photo limit reached' : 'Take photo'}
              accessibilityState={{ disabled: atLimit || taking || !cameraReady || Boolean(cameraError) }}
              disabled={atLimit || taking || !cameraReady || Boolean(cameraError)}
              onPress={takePhoto}
              style={({ pressed }) => [styles.shutterOuter, (pressed || atLimit || taking || !cameraReady || Boolean(cameraError)) && styles.dim]}
            >
              <View style={styles.shutterInner} />
            </Pressable>
            <View style={[styles.shutterSide, styles.rightStatus]}>
              {!cameraReady && !cameraError ? <ActivityIndicator color="#FFFFFF" /> : <ThemedText style={styles.readyText}>{taking ? 'Saving…' : 'Ready'}</ThemedText>}
            </View>
          </View>
        </View>
      </View>

      <Modal visible={preview !== null} animationType="fade" transparent onRequestClose={() => setPreview(null)}>
        <SafeAreaView style={styles.previewBackdrop}>
          {preview ? <Image source={{ uri: preview.uri }} style={styles.previewImage} resizeMode="contain" /> : null}
          <View style={styles.previewActions}>
            <Pressable accessibilityRole="button" onPress={() => setPreview(null)} style={styles.previewButton}>
              <ThemedText style={styles.previewButtonText}>Back to camera</ThemedText>
            </Pressable>
            {preview ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Remove this photo" onPress={() => removePhoto(preview.id)} style={[styles.previewButton, styles.removeButton]}>
                <ThemedText style={styles.previewButtonText}>Remove photo</ThemedText>
              </Pressable>
            ) : null}
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function PermissionState({
  loading = false,
  title = 'Opening the camera…',
  body = 'ClassLens is checking camera access.',
  action,
  onPress,
}: {
  loading?: boolean;
  title?: string;
  body?: string;
  action?: string;
  onPress?: () => void | Promise<unknown>;
}) {
  return (
    <SafeAreaView style={styles.permissionPage}>
      {loading ? <ActivityIndicator size="large" color={Brand.forest} /> : <ThemedText style={styles.permissionMark}>◎</ThemedText>}
      <ThemedText type="title" style={styles.permissionTitle}>{title}</ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.permissionBody}>{body}</ThemedText>
      {action && onPress ? (
        <Pressable accessibilityRole="button" onPress={onPress} style={styles.permissionButton}>
          <ThemedText style={styles.permissionButtonText}>{action}</ThemedText>
        </Pressable>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#08120E' },
  cameraShell: { flex: 1, overflow: 'hidden', backgroundColor: '#08120E' },
  topScrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: '55%', backgroundColor: 'rgba(4,12,8,0.2)' },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18 },
  eyebrow: { color: Brand.lime, fontSize: 10, lineHeight: 14, fontWeight: '800', letterSpacing: 1.4 },
  counter: { color: '#FFFFFF', fontSize: 18, lineHeight: 24, fontWeight: '700' },
  done: { minHeight: 46, minWidth: 82, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: Brand.lime },
  doneText: { color: Brand.ink, fontWeight: '800' },
  guide: { position: 'absolute', top: 90, left: 24, right: 24, bottom: 245 },
  corner: { position: 'absolute', width: 34, height: 34, borderColor: 'rgba(255,255,255,0.78)' },
  topLeft: { top: 0, left: 0, borderTopWidth: 2, borderLeftWidth: 2, borderTopLeftRadius: 8 },
  topRight: { top: 0, right: 0, borderTopWidth: 2, borderRightWidth: 2, borderTopRightRadius: 8 },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 2, borderLeftWidth: 2, borderBottomLeftRadius: 8 },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: 2, borderRightWidth: 2, borderBottomRightRadius: 8 },
  bottomPanel: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: 12, paddingTop: 16, paddingBottom: 12, backgroundColor: 'rgba(7,17,12,0.88)' },
  thumbnails: { minHeight: 74, alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  thumbnailButton: { width: 58, height: 72, overflow: 'hidden', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' },
  thumbnail: { width: '100%', height: '100%' },
  thumbnailNumber: { position: 'absolute', left: 5, bottom: 5, width: 20, height: 20, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: 'rgba(25,45,39,0.9)' },
  thumbnailNumberText: { color: '#FFFFFF', fontSize: 10, lineHeight: 13, fontWeight: '800' },
  emptyStrip: { color: 'rgba(255,255,255,0.68)', fontSize: 13 },
  shutterRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  shutterSide: { flex: 1 },
  rightStatus: { alignItems: 'flex-end' },
  limitText: { color: 'rgba(255,255,255,0.76)', fontSize: 11, lineHeight: 15 },
  readyText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  shutterOuter: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center', borderRadius: 36, borderWidth: 4, borderColor: '#FFFFFF' },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: Brand.lime },
  errorCard: { marginHorizontal: 16, gap: 5, padding: 14, borderRadius: 16, backgroundColor: '#F8E8E5' },
  errorTitle: { color: '#7D3333', fontSize: 16, fontWeight: '800' },
  errorBody: { color: '#7D3333', fontSize: 13, lineHeight: 18 },
  retryButton: { minHeight: 38, alignItems: 'center', justifyContent: 'center', marginTop: 4, borderRadius: 12, backgroundColor: '#7D3333' },
  retryText: { color: '#FFFFFF', fontWeight: '700' },
  previewBackdrop: { flex: 1, justifyContent: 'space-between', padding: 18, backgroundColor: '#06100C' },
  previewImage: { flex: 1, width: '100%' },
  previewActions: { flexDirection: 'row', gap: 12, paddingTop: 16 },
  previewButton: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: Brand.forest },
  removeButton: { backgroundColor: '#8C3B3B' },
  previewButtonText: { color: '#FFFFFF', fontWeight: '700' },
  permissionPage: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, padding: 28, backgroundColor: Brand.paper },
  permissionMark: { color: Brand.forest, fontSize: 48, lineHeight: 56 },
  permissionTitle: { textAlign: 'center' },
  permissionBody: { maxWidth: 420, textAlign: 'center' },
  permissionButton: { minHeight: 54, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: Brand.forest },
  permissionButtonText: { color: '#FFFFFF', fontWeight: '700' },
  dim: { opacity: 0.5 },
});
