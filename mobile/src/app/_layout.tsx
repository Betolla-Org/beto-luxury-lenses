import { Manrope_300Light, Manrope_400Regular, Manrope_700Bold } from '@expo-google-fonts/manrope';
import { PlayfairDisplay_700Bold, PlayfairDisplay_900Black } from '@expo-google-fonts/playfair-display';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { colors } from '../theme';

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    PlayfairDisplay_700Bold,
    PlayfairDisplay_900Black,
    Manrope_300Light,
    Manrope_400Regular,
    Manrope_700Bold,
  });

  // Fall back to system fonts rather than blocking the app if fonts fail to load
  if (!fontsLoaded && !fontError) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.black, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.black },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="try-on/[id]" options={{ animation: 'slide_from_bottom' }} />
      </Stack>
    </>
  );
}
