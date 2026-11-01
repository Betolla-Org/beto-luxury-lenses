import { Redirect, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { FlatList, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, CameraRef, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { clamp } from '../../../../engine';
import { LENSES, findLens, type Lens } from '../../catalog';
import { LensOverlay } from '../../components/LensOverlay';
import { BackButton, GoldButton, LensSwatch } from '../../components/ui';
import { useEyeTracking } from '../../hooks/useEyeTracking';
import { colors, fonts } from '../../theme';

const MIN_SIZE = 0.8;
const MAX_SIZE = 1.3;
const SIZE_STEP = 0.02;

export default function TryOnRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const lens = findLens(id);
  const { hasPermission, canRequestPermission, requestPermission } = useCameraPermission();

  if (!lens) return <Redirect href="/" />;
  if (!hasPermission) {
    return (
      <PermissionScreen
        canAsk={canRequestPermission}
        onAsk={() => (canRequestPermission ? requestPermission() : Linking.openSettings())}
      />
    );
  }
  return <TryOnScreen initialLens={lens} />;
}

function TryOnScreen({ initialLens }: { initialLens: Lens }) {
  const insets = useSafeAreaInsets();
  const device = useCameraDevice('front');
  const cameraRef = useRef<CameraRef>(null);
  const [lens, setLens] = useState(initialLens);
  const [sizeAdjustment, setSizeAdjustment] = useState(1);
  const { output, eyes, faceFound } = useEyeTracking(cameraRef, sizeAdjustment);
  const outputs = useMemo(() => [output], [output]);

  const changeSize = (delta: number) => setSizeAdjustment(s => clamp(s + delta, MIN_SIZE, MAX_SIZE));

  return (
    <View style={styles.screen}>
      <View style={styles.viewport}>
        {device ? (
          <Camera
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            device={device}
            isActive
            outputs={outputs}
            mirrorMode="auto"
            resizeMode="cover"
          />
        ) : (
          <Text style={styles.centerNote}>No front camera found</Text>
        )}
        <LensOverlay eyes={eyes} color={lens.color} />

        {!faceFound && (
          <View style={styles.faceGuideWrap} pointerEvents="none">
            <Text style={styles.faceGuideLabel}>POSITION FACE</Text>
            <View style={styles.faceGuide} />
          </View>
        )}

        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <BackButton />
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.lensTitle}>{lens.name}</Text>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: faceFound ? '#22C55E' : '#EF4444' }]} />
              <Text style={styles.statusText}>{faceFound ? 'LIVE TRACKING' : 'SEARCHING...'}</Text>
            </View>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* Size controls */}
        <View style={styles.sizeControls}>
          <Pressable style={styles.sizeButton} onPress={() => changeSize(SIZE_STEP)} accessibilityLabel="Bigger lens">
            <Text style={styles.sizeButtonText}>+</Text>
          </Pressable>
          <View style={styles.sizeTrack}>
            <View style={[styles.sizeFill, { height: `${((sizeAdjustment - MIN_SIZE) / (MAX_SIZE - MIN_SIZE)) * 100}%` }]} />
          </View>
          <Pressable style={styles.sizeButton} onPress={() => changeSize(-SIZE_STEP)} accessibilityLabel="Smaller lens">
            <Text style={styles.sizeButtonText}>−</Text>
          </Pressable>
        </View>
      </View>

      {/* Lens picker */}
      <View style={[styles.picker, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.pickerHeader}>
          <Text style={styles.pickerCollection}>COLLECTION: {lens.collection}</Text>
          <Text style={styles.pickerName}>{lens.name}</Text>
        </View>
        <FlatList
          horizontal
          data={LENSES}
          keyExtractor={l => l.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 12, paddingVertical: 6 }}
          initialScrollIndex={Math.max(0, LENSES.findIndex(l => l.id === initialLens.id))}
          getItemLayout={(_, index) => ({ length: 68, offset: 68 * index, index })}
          renderItem={({ item }) => {
            const selected = item.id === lens.id;
            return (
              <Pressable
                onPress={() => setLens(item)}
                style={[styles.swatchRing, selected ? styles.swatchSelected : { opacity: 0.5 }]}
                accessibilityLabel={item.name}
              >
                <LensSwatch color={item.color} size={48} />
              </Pressable>
            );
          }}
        />
      </View>
    </View>
  );
}

function PermissionScreen({ canAsk, onAsk }: { canAsk: boolean; onAsk: () => void }) {
  return (
    <View style={[styles.screen, styles.permission]}>
      <View style={{ position: 'absolute', top: 56, left: 24 }}>
        <BackButton />
      </View>
      <Text style={styles.permissionTitle}>Camera Access Needed</Text>
      <Text style={styles.permissionBody}>
        BETO uses the front camera to show the lens on your eyes live. Video stays on your phone.
      </Text>
      <GoldButton label={canAsk ? 'ALLOW CAMERA' : 'OPEN SETTINGS'} onPress={onAsk} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'black' },
  viewport: { flex: 1, overflow: 'hidden', backgroundColor: '#171717' },
  centerNote: { color: colors.muted, textAlign: 'center', marginTop: '60%', fontFamily: fonts.sans },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  lensTitle: { fontFamily: fonts.serif, fontSize: 18, color: colors.gold, letterSpacing: 3 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontFamily: fonts.sans, fontSize: 10, color: colors.muted },
  faceGuideWrap: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  faceGuideLabel: { fontFamily: fonts.sansBold, fontSize: 11, color: colors.muted, letterSpacing: 3, marginBottom: 12 },
  faceGuide: { width: 192, height: 256, borderRadius: 128, borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)' },
  sizeControls: { position: 'absolute', right: 16, top: '40%', alignItems: 'center', gap: 16 },
  sizeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sizeButtonText: { color: colors.white, fontSize: 22, fontFamily: fonts.sansBold },
  sizeTrack: { width: 4, height: 32, borderRadius: 2, backgroundColor: colors.faint, justifyContent: 'flex-end' },
  sizeFill: { width: '100%', borderRadius: 2, backgroundColor: colors.gold },
  picker: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.faint, paddingHorizontal: 20, paddingTop: 16 },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 },
  pickerCollection: { fontFamily: fonts.sansBold, fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: 2 },
  pickerName: { fontFamily: fonts.serif, fontSize: 12, color: colors.gold },
  swatchRing: { width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  swatchSelected: { borderColor: colors.gold, transform: [{ scale: 1.1 }] },
  permission: { alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: colors.black },
  permissionTitle: { fontFamily: fonts.serif, fontSize: 24, color: colors.gold, marginBottom: 12 },
  permissionBody: { fontFamily: fonts.sans, fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
});
