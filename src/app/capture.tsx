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
  type PhotoQualityWarning,
} from '@/features/capture/captureSession';
import { checkPhotoQuality } from '@/features/capture/photoQuality';

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
    quality: {
      status: 'checking',
      warnings: [],
      metrics: null,
    },
  };
}

function warningMessage(warnings: PhotoQualityWarning[]): string {
  const labels = warnings.map((warning) => {
    if (warning === 'too-dark') return 'too dark';
    if (warning === 'too-bright') return 'too bright';
    return 'blurry';
  });
  if (labels.length === 1) return `This photo looks ${labels[0]}.`;
  return `This photo looks ${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}.`;
}

export default function CaptureScreen() {
  const camera = useRef<CameraView>(null);
  const requestedPermission = useRef(false);
  const sequence = useRef(0);
  const pending = useRef(0);
  const sessionId = useRef(`capture-${Date.now()}`);
  const sessionCreatedAt = useRef(new Date().toISOString());
  const photosRef = useRef<CaptureSessionPhoto[]>([]);
  const checks = useRef(new Map<string, Promise<void>>());
  const warningTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const removedPhotos = useRef(new Set<string>());

  const [permission, requestPermission] = useCameraPermissions();
  const [requestingPermission, setRequestingPermission] = useState(false);
  const [photos, setPhotos] = useState<CaptureSessionPhoto[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [preview, setPreview] = useState<CaptureSessionPhoto | null>(null);
  const [taking, setTaking] = useState(false);
  const [focused, setFocused] = useState(true);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [cameraKey, setCameraKey] = useState(0);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => () => {
    warningTimers.current.forEach(clearTimeout);
    warningTimers.current.clear();
  }, []);

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

  function updatePhotos(updater: (current: CaptureSessionPhoto[]) => CaptureSessionPhoto[]) {
    setPhotos((current) => {
      const next = updater(current);
      photosRef.current = next;
      return next;
    });
  }

  function savePicture(picture: CameraCapturedPicture) {
    pending.current = Math.max(0, pending.current - 1);
    setPendingCount(pending.current);
    sequence.current += 1;
    const photo = photoFromCamera(picture, sequence.current);
    updatePhotos((current) => {
      if (current.length >= MAX_CAPTURE_PHOTOS) return current;
      return [...current, photo];
    });
    const task = analyzePhoto(photo);
    checks.current.set(photo.id, task);
    void task.finally(() => checks.current.delete(photo.id));
  }

  async function analyzePhoto(photo: CaptureSessionPhoto) {
    const quality = await checkPhotoQuality(photo.uri);
    if (removedPhotos.current.has(photo.id)) return;
    updatePhotos((current) => current.map((item) => item.id === photo.id ? { ...item, quality } : item));
    if (quality.status === 'warning') {
      const timer = setTimeout(() => keepAnyway(photo.id), 3000);
      warningTimers.current.set(photo.id, timer);
    }
  }

  async function takePhoto() {
    if (!camera.current || !cameraReady || taking || photos.length + pending.current >= MAX_CAPTURE_PHOTOS) return;
    setTaking(true);
    setCameraError('');
    pending.current += 1;
    setPendingCount(pending.current);
    try {
      await camera.current.takePictureAsync({
        quality: 0.9,
        onPictureSaved: savePicture,
      });
    } catch (caught) {
      pending.current = Math.max(0, pending.current - 1);
      setPendingCount(pending.current);
      setCameraError(caught instanceof Error ? caught.message : 'ClassLens could not take that photo. Try again.');
    } finally {
      setTaking(false);
    }
  }

  function removePhoto(photoId: string) {
    removedPhotos.current.add(photoId);
    const timer = warningTimers.current.get(photoId);
    if (timer) clearTimeout(timer);
    warningTimers.current.delete(photoId);
    updatePhotos((current) => current.filter((photo) => photo.id !== photoId));
    setPreview((current) => current?.id === photoId ? null : current);
  }

  function keepAnyway(photoId: string) {
    const timer = warningTimers.current.get(photoId);
    if (timer) clearTimeout(timer);
    warningTimers.current.delete(photoId);
    updatePhotos((current) => current.map((photo) => photo.id === photoId && photo.quality.status === 'warning'
      ? { ...photo, quality: { ...photo.quality, status: 'accepted-anyway' } }
      : photo));
  }

  function retryCamera() {
    setCameraError('');
    setCameraReady(false);
    setCameraKey((current) => current + 1);
  }

  async function finishSession() {
    if (!photosRef.current.length || pending.current > 0 || finishing) return;
    setFinishing(true);
    const activeChecks = [...checks.current.values()];
    const completed = activeChecks.length === 0 || await Promise.race([
      Promise.allSettled(activeChecks).then(() => true),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), 1500)),
    ]);
    let sessionPhotos = photosRef.current;
    if (!completed) {
      sessionPhotos = sessionPhotos.map((photo) => photo.quality.status === 'checking'
        ? {
            ...photo,
            quality: {
              status: 'unchecked' as const,
              warnings: [],
              metrics: null,
              checkedAt: new Date().toISOString(),
              error: 'Quality check did not finish before the session was handed off.',
            },
          }
        : photo);
      photosRef.current = sessionPhotos;
      setPhotos(sessionPhotos);
    }
    const session: CaptureSession = {
      version: 1,
      id: sessionId.current,
      createdAt: sessionCreatedAt.current,
      photos: sessionPhotos,
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

  const atLimit = photos.length + pendingCount >= MAX_CAPTURE_PHOTOS;
  const activeWarning = photos.find((photo) => photo.quality.status === 'warning');
  const previewPhoto = photos.find((photo) => photo.id === preview?.id) ?? preview;
  const checking = photos.some((photo) => photo.quality.status === 'checking');

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
            accessibilityState={{ disabled: photos.length === 0 || pendingCount > 0 || finishing, busy: finishing }}
            disabled={photos.length === 0 || pendingCount > 0 || finishing}
            onPress={finishSession}
            style={({ pressed }) => [styles.done, (pressed || photos.length === 0 || pendingCount > 0 || finishing) && styles.dim]}
          >
            <ThemedText style={styles.doneText}>{finishing ? 'Checking…' : 'Done'}</ThemedText>
          </Pressable>
        </View>

        <View style={styles.guide} pointerEvents="none">
          <View style={[styles.corner, styles.topLeft]} />
          <View style={[styles.corner, styles.topRight]} />
          <View style={[styles.corner, styles.bottomLeft]} />
          <View style={[styles.corner, styles.bottomRight]} />
        </View>

        <View style={styles.bottomPanel}>
          {activeWarning ? (
            <View accessibilityLiveRegion="polite" style={styles.warningCard}>
              <View style={styles.warningCopy}>
                <ThemedText style={styles.warningTitle}>Check photo {photos.indexOf(activeWarning) + 1}</ThemedText>
                <ThemedText style={styles.warningBody}>{warningMessage(activeWarning.quality.warnings)}</ThemedText>
              </View>
              <View style={styles.warningActions}>
                <Pressable accessibilityRole="button" accessibilityLabel="Retake warning photo" onPress={() => removePhoto(activeWarning.id)} style={styles.warningButton}>
                  <ThemedText style={styles.warningButtonText}>Retake</ThemedText>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => keepAnyway(activeWarning.id)} style={[styles.warningButton, styles.keepButton]}>
                  <ThemedText style={styles.keepButtonText}>Keep Anyway</ThemedText>
                </Pressable>
              </View>
            </View>
          ) : null}

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
                {photo.quality.status === 'checking' ? (
                  <View style={styles.qualityBadge}><ActivityIndicator size="small" color="#FFFFFF" /></View>
                ) : photo.quality.status === 'warning' || photo.quality.status === 'accepted-anyway' ? (
                  <View style={[styles.qualityBadge, styles.qualityWarning]}><ThemedText style={styles.qualityBadgeText}>!</ThemedText></View>
                ) : photo.quality.status === 'unchecked' ? (
                  <View style={[styles.qualityBadge, styles.qualityUnchecked]}><ThemedText style={styles.qualityBadgeText}>?</ThemedText></View>
                ) : (
                  <View style={[styles.qualityBadge, styles.qualityGood]}><ThemedText style={styles.qualityBadgeText}>✓</ThemedText></View>
                )}
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
              {!cameraReady && !cameraError ? <ActivityIndicator color="#FFFFFF" /> : <ThemedText style={styles.readyText}>{taking ? 'Saving…' : checking ? 'Checking…' : 'Ready'}</ThemedText>}
            </View>
          </View>
        </View>
      </View>

      <Modal visible={preview !== null} animationType="fade" transparent onRequestClose={() => setPreview(null)}>
        <SafeAreaView style={styles.previewBackdrop}>
          {previewPhoto ? <Image source={{ uri: previewPhoto.uri }} style={styles.previewImage} resizeMode="contain" /> : null}
          {previewPhoto?.quality.status === 'accepted-anyway' || previewPhoto?.quality.status === 'warning' ? (
            <View style={styles.previewWarning}>
              <ThemedText style={styles.previewWarningText}>{warningMessage(previewPhoto.quality.warnings)}</ThemedText>
            </View>
          ) : null}
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
  qualityBadge: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: 'rgba(25,45,39,0.9)' },
  qualityWarning: { backgroundColor: '#B45C23' },
  qualityUnchecked: { backgroundColor: '#6F675D' },
  qualityGood: { backgroundColor: Brand.forest },
  qualityBadgeText: { color: '#FFFFFF', fontSize: 12, lineHeight: 15, fontWeight: '900' },
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
  warningCard: { marginHorizontal: 16, gap: 12, padding: 14, borderRadius: 16, backgroundColor: '#FFF4DF' },
  warningCopy: { gap: 3 },
  warningTitle: { color: '#714313', fontSize: 15, fontWeight: '800' },
  warningBody: { color: '#714313', fontSize: 13, lineHeight: 18 },
  warningActions: { flexDirection: 'row', gap: 10 },
  warningButton: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#9B6428', borderRadius: 12 },
  warningButtonText: { color: '#714313', fontWeight: '800' },
  keepButton: { borderColor: Brand.forest, backgroundColor: Brand.forest },
  keepButtonText: { color: '#FFFFFF', fontWeight: '800' },
  previewBackdrop: { flex: 1, justifyContent: 'space-between', padding: 18, backgroundColor: '#06100C' },
  previewImage: { flex: 1, width: '100%' },
  previewWarning: { marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: '#FFF4DF' },
  previewWarningText: { color: '#714313', textAlign: 'center', fontWeight: '700' },
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
