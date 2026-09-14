import { StyleSheet, Text, View } from 'react-native';
import { Brand } from '@/constants/theme';

/** Decorative diagram built with native views; it never represents an uploaded file. */
export function ScanArtwork({ compact = false }: { compact?: boolean }) {
  return <View accessible={false} importantForAccessibility="no-hide-descendants" style={[styles.stage, compact && styles.compact]}>
    <View style={[styles.sheet, styles.behind]} />
    <View style={styles.sheet}>
      <Text allowFontScaling={false} style={styles.eyebrow}>A MOMENT FROM CLASS</Text>
      <Text allowFontScaling={false} style={styles.title}>Ideas, connected.</Text>
      <View style={styles.line} /><View style={[styles.line, { width: '65%' }]} />
      <View style={styles.diagram}><View style={styles.node} /><View style={styles.connector} /><View style={styles.node} /><View style={styles.connector} /><View style={styles.node} /></View>
      <View style={[styles.line, { width: '80%' }]} />
    </View>
    <View style={[styles.corner, styles.topLeft]} /><View style={[styles.corner, styles.topRight]} />
    <View style={[styles.corner, styles.bottomLeft]} /><View style={[styles.corner, styles.bottomRight]} />
    <View style={styles.result}><Text allowFontScaling={false} style={styles.resultText}>✦  From scattered to structured</Text></View>
  </View>;
}

const styles = StyleSheet.create({
  stage: { height: 280, width: '100%', alignItems: 'center', justifyContent: 'center' },
  compact: { height: 240 },
  sheet: { width: '84%', maxWidth: 280, padding: 16, gap: 12, borderRadius: 12, backgroundColor: Brand.paper, transform: [{ rotate: '-4deg' }] },
  behind: { position: 'absolute', height: 180, backgroundColor: '#7C9A80', transform: [{ rotate: '6deg' }] },
  eyebrow: { color: '#627264', fontSize: 9, letterSpacing: 1, fontWeight: '600' },
  title: { color: Brand.ink, fontSize: 16, lineHeight: 20, fontWeight: '600' },
  line: { height: 4, width: '100%', borderRadius: 4, backgroundColor: '#D5DDCF' },
  diagram: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 4 },
  node: { height: 24, width: 24, borderRadius: 8, borderWidth: 1, borderColor: '#789475', backgroundColor: '#E4ECD9' },
  connector: { width: 16, height: 1, backgroundColor: '#789475' },
  corner: { position: 'absolute', width: 24, height: 24, borderColor: Brand.lime },
  topLeft: { left: 8, top: 16, borderTopWidth: 2, borderLeftWidth: 2, borderTopLeftRadius: 8 },
  topRight: { right: 8, top: 16, borderTopWidth: 2, borderRightWidth: 2, borderTopRightRadius: 8 },
  bottomLeft: { left: 8, bottom: 16, borderBottomWidth: 2, borderLeftWidth: 2, borderBottomLeftRadius: 8 },
  bottomRight: { right: 8, bottom: 16, borderBottomWidth: 2, borderRightWidth: 2, borderBottomRightRadius: 8 },
  result: { position: 'absolute', bottom: 16, backgroundColor: Brand.lime, padding: 12, borderRadius: 12 },
  resultText: { fontSize: 11, fontWeight: '600', color: Brand.ink },
});
