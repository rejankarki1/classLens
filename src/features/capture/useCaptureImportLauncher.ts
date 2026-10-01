import { router } from 'expo-router';
import { useCallback, useRef } from 'react';
import { Alert } from 'react-native';

import {
  prepareCaptureImport,
} from '@/features/capture/captureImports';

export function useCaptureImportLauncher() {
  const pickerInFlight = useRef(false);

  return useCallback(async () => {
    if (pickerInFlight.current) return;
    pickerInFlight.current = true;

    try {
      const prepared = await prepareCaptureImport();
      if (!prepared) return;

      router.push({
        pathname: '/capture',
        params: {
          source: 'photos',
          imported: JSON.stringify(prepared),
        },
      });
    } catch (error) {
      console.error('[capture-import] Picker failed', error);
      Alert.alert('Could not add images', "Couldn't open your photos. Try again.");
    } finally {
      pickerInFlight.current = false;
    }
  }, []);
}
