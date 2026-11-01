import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLLECTIONS, COLLECTION_IMAGES, HERO_IMAGE, LENSES } from '../catalog';
import { GoldButton, LensSwatch } from '../components/ui';
import { colors, fonts } from '../theme';

const TRENDING = LENSES.slice(0, 5);

export default function HomeScreen() {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
      {/* Hero */}
      <View style={{ height: height * 0.65 }}>
        <Image source={HERO_IMAGE} style={StyleSheet.absoluteFill} contentFit="cover" transition={400} />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.2)', colors.black]}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.heroContent, { paddingTop: insets.top }]}>
          <Text style={styles.brand}>BETO</Text>
          <Text style={styles.tagline}>THE ART OF VISION</Text>
          <LinearGradient
            colors={['transparent', colors.gold, 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.divider}
          />
          <Text style={styles.slogan}>
            الجمال في <Text style={{ color: colors.gold, fontStyle: 'italic' }}>التفاصيل</Text>
          </Text>
          <GoldButton label="اكتشف المجموعة" onPress={() => router.push('/collection/MERAL')} />
        </View>
      </View>

      {/* Trending */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>TRENDING NOW</Text>
        <Text style={styles.sectionHint}>الأكثر طلباً</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 16 }}>
        {TRENDING.map(lens => (
          <Pressable key={lens.id} onPress={() => router.push(`/try-on/${lens.id}`)} style={{ width: 128 }}>
            <View style={styles.trendingCard}>
              <LensSwatch color={lens.color} size={80} />
            </View>
            <Text style={styles.trendingName} numberOfLines={1}>{lens.name}</Text>
            <Text style={styles.trendingCollection}>{lens.collection}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Collections */}
      <View style={styles.collectionsDivider}>
        <View style={styles.goldLine} />
        <Text style={styles.collectionsLabel}>مجموعاتنا الحصرية</Text>
        <View style={styles.goldLine} />
      </View>
      <View style={{ paddingHorizontal: 20, gap: 40 }}>
        {COLLECTIONS.map((collection, index) => (
          <Pressable key={collection.name} onPress={() => router.push(`/collection/${collection.name}`)}>
            {({ pressed }) => (
              <View style={[styles.collectionCard, { opacity: pressed ? 0.85 : 1 }]}>
                <Image source={COLLECTION_IMAGES[collection.name]} style={StyleSheet.absoluteFill} contentFit="cover" transition={400} />
                <LinearGradient colors={['rgba(0,0,0,0.1)', 'transparent', colors.black]} style={StyleSheet.absoluteFill} />
                <Text style={styles.collectionIndex}>0{index + 1}</Text>
                <View>
                  <Text style={styles.collectionName}>{collection.name}</Text>
                  <Text style={styles.collectionLabel}>COLLECTION</Text>
                  <Text style={styles.collectionDescription}>{collection.description}</Text>
                </View>
              </View>
            )}
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.black },
  heroContent: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 48, paddingHorizontal: 16 },
  brand: { fontFamily: fonts.serifBlack, fontSize: 64, color: colors.gold, letterSpacing: 10 },
  tagline: { fontFamily: fonts.sansLight, fontSize: 10, color: 'rgba(255,255,255,0.8)', letterSpacing: 8, marginTop: 4 },
  divider: { height: 1, width: 96, marginVertical: 24, opacity: 0.8 },
  slogan: { fontFamily: fonts.serif, fontSize: 28, color: colors.white, marginBottom: 32 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginTop: 40, marginBottom: 16 },
  sectionTitle: { fontFamily: fonts.serif, fontSize: 18, color: colors.gold, letterSpacing: 3 },
  sectionHint: { fontFamily: fonts.sansBold, fontSize: 10, color: 'rgba(255,255,255,0.4)' },
  trendingCard: {
    aspectRatio: 3 / 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.faint,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trendingName: { fontFamily: fonts.serif, fontSize: 12, color: colors.white, textAlign: 'center', marginTop: 8 },
  trendingCollection: { fontFamily: fonts.sans, fontSize: 9, color: 'rgba(212,175,55,0.6)', textAlign: 'center', letterSpacing: 1.5 },
  collectionsDivider: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 28, marginTop: 48, marginBottom: 40, opacity: 0.6 },
  goldLine: { flex: 1, height: 1, backgroundColor: colors.gold },
  collectionsLabel: { fontFamily: fonts.sansLight, fontSize: 10, color: colors.white, letterSpacing: 3 },
  collectionCard: {
    aspectRatio: 4 / 5,
    borderRadius: 32,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    padding: 32,
    justifyContent: 'space-between',
  },
  collectionIndex: { alignSelf: 'flex-end', fontFamily: fonts.serifBlack, fontSize: 56, color: 'rgba(255,255,255,0.1)' },
  collectionName: { fontFamily: fonts.serif, fontSize: 36, color: colors.white, letterSpacing: 4 },
  collectionLabel: { fontFamily: fonts.sans, fontSize: 13, color: colors.gold, letterSpacing: 2, marginBottom: 16, opacity: 0.8 },
  collectionDescription: { fontFamily: fonts.sansLight, fontSize: 14, color: 'rgba(255,255,255,0.8)', lineHeight: 22 },
});
