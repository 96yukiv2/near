import { StatusBar } from "expo-status-bar";
import { SafeAreaView, StyleSheet, Text, View } from "react-native";

export default function App() {
  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.content}>
        <Text style={styles.brand}>near.</Text>
        <Text style={styles.title}>いつものみんなを、もっと近くに。</Text>
        <Text style={styles.description}>
          スマホアプリを準備しています。友達や位置はまだ表示されません。
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fffaf1" },
  content: { flex: 1, justifyContent: "center", padding: 32, gap: 18 },
  brand: { color: "#e76a53", fontSize: 44, fontWeight: "800" },
  title: { color: "#2f3441", fontSize: 24, fontWeight: "700" },
  description: { color: "#606879", fontSize: 16, lineHeight: 26 },
});
