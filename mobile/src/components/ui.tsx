import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, fonts, goldGradient } from '../theme';

/** Solid lens color with a soft sheen, like the web app's swatches. */
export function LensSwatch({ color, size }: { color: string; size: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, overflow: 'hidden' }}>
      <LinearGradient
        colors={['rgba(255,255,255,0.3)', 'transparent', 'rgba(0,0,0,0.2)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

export function GoldButton({ label, onPress, style }: { label: string; onPress: () => void; style?: ViewStyle }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.96 : 1 }] }, style]}>
      <LinearGradient colors={goldGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.goldButton}>
        <Text style={styles.goldButtonText}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

export function BackButton({ onPress = () => router.back() }: { onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={12} style={styles.roundButton} accessibilityLabel="Back">
      <Text style={styles.backArrow}>‹</Text>
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  goldButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: 'center',
  },
  goldButtonText: {
    color: colors.black,
    fontFamily: fonts.sansBold,
    fontSize: 13,
    letterSpacing: 2,
  },
  roundButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: {
    color: colors.white,
    fontSize: 28,
    lineHeight: 30,
    marginTop: -2,
  },
});
