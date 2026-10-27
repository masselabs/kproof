import {StyleSheet} from 'react-native';

/** Brand kit v1.0 colors and the neutral greys from the design. */
export const colors = {
  paper: '#F5F5F7',
  card: '#FFFFFF',
  blue: '#0047A0',
  blueDark: '#00377C',
  blueTint: '#EDF3FA',
  red: '#CD2E3A',
  ink: '#161619',
  muted: '#62626E',
  line: '#DDDDE2',
  faint: '#A9AAB5',
  photo: '#EDEEF2',
  photoInk: '#B5B7C2',
  white: '#FFFFFF',
  scrim: 'rgba(22,22,25,0.45)',
} as const;

/** Pretendard static faces (assets/fonts), named by PostScript name. */
export const font = {
  regular: 'Pretendard-Regular',
  semibold: 'Pretendard-SemiBold',
  bold: 'Pretendard-Bold',
} as const;

export const common = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.paper},
  panel: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
  },
  h1: {fontFamily: font.bold, fontSize: 26, color: colors.ink},
  body: {fontFamily: font.regular, fontSize: 15, color: colors.ink, lineHeight: 22},
  mutedText: {fontFamily: font.regular, fontSize: 14, color: colors.muted, lineHeight: 20},
  sectionLabel: {fontFamily: font.bold, fontSize: 13, color: colors.muted},
});
