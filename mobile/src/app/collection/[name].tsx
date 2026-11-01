import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { findCollection } from '../../catalog';
import { BackButton, LensSwatch } from '../../components/ui';
import { colors, fonts } from '../../theme';

export default function CollectionScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const insets = useSafeAreaInsets();
  const collection = findCollection(name);
  if (!collection) return <Redirect href="/" />;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <BackButton />
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.title}>{collection.name}</Text>
          <View style={styles.titleRule} />
        </View>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={collection.lenses}
        keyExtractor={l => l.id}
        numColumns={2}
        columnWrapperStyle={{ gap: 20 }}
        contentContainerStyle={{ padding: 24, gap: 24, paddingBottom: insets.bottom + 32 }}
        ListHeaderComponent={<Text style={styles.description}>{collection.description}</Text>}
        renderItem={({ item: lens }) => (
          <Pressable style={{ flex: 1 }} onPress={() => router.push(`/try-on/${lens.id}`)}>
            {({ pressed }) => (
              <>
                <View style={[styles.card, pressed && { borderColor: 'rgba(212,175,55,0.4)' }]}>
                  <LensSwatch color={lens.color} size={96} />
                </View>
                <Text style={styles.lensName}>{lens.name}</Text>
                <Text style={styles.lensCode}>{lens.code}</Text>
              </>
            )}
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.black },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  title: { fontFamily: fonts.serif, fontSize: 24, color: colors.gold, letterSpacing: 5 },
  titleRule: { height: 2, width: 32, backgroundColor: colors.gold, opacity: 0.5, marginTop: 4 },
  description: { fontFamily: fonts.sansLight, fontSize: 14, color: colors.muted, textAlign: 'center', marginBottom: 8, lineHeight: 22 },
  card: {
    aspectRatio: 3 / 4,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lensName: { fontFamily: fonts.serif, fontSize: 16, color: colors.white, textAlign: 'center', marginTop: 12 },
  lensCode: {
    alignSelf: 'center',
    fontFamily: fonts.sansBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.3)',
    letterSpacing: 2,
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
  },
});
