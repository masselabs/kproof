import React from 'react';
import {Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle} from 'react-native';
import Svg, {Circle, Path, Rect, SvgXml} from 'react-native-svg';
import {colors, font} from './theme';
import {SYMBOL_COLOR, WORDMARK_COLOR} from './brandMarks';

export function Txt(props: {
  children: React.ReactNode;
  weight?: keyof typeof font;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  testID?: string;
}) {
  const {weight = 'regular', size = 15, color = colors.ink} = props;
  return (
    <Text
      testID={props.testID}
      numberOfLines={props.numberOfLines}
      style={[{fontFamily: font[weight], fontSize: size, color, lineHeight: Math.round(size * 1.45)}, props.style]}>
      {props.children}
    </Text>
  );
}

export function Wordmark({width}: {width: number}) {
  return <SvgXml xml={WORDMARK_COLOR} width={width} height={(width * 144) / 789} accessibilityLabel="KProof" />;
}

export function Symbol({size}: {size: number}) {
  return <SvgXml xml={SYMBOL_COLOR} width={(size * 132) / 144} height={size} />;
}

export function PrimaryButton(props: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
  color?: string;
  testID?: string;
}) {
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole="button"
      disabled={props.disabled}
      onPress={props.onPress}
      style={({pressed}) => [
        styles.primary,
        {backgroundColor: props.color ?? colors.blue, opacity: props.disabled ? 0.4 : pressed ? 0.85 : 1},
      ]}>
      {props.icon}
      <Txt weight="bold" size={17} color={colors.white}>
        {props.label}
      </Txt>
    </Pressable>
  );
}

export function TextButton(props: {label: string; onPress: () => void; color?: string; testID?: string}) {
  return (
    <Pressable testID={props.testID} accessibilityRole="button" onPress={props.onPress} style={styles.textButton}>
      <Txt weight="semibold" size={16} color={props.color ?? colors.muted}>
        {props.label}
      </Txt>
    </Pressable>
  );
}

export function OutlineButton(props: {label: string; onPress: () => void; style?: StyleProp<ViewStyle>}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onPress}
      style={({pressed}) => [styles.outline, {opacity: pressed ? 0.7 : 1}, props.style]}>
      <Txt weight="semibold" size={15}>
        {props.label}
      </Txt>
    </Pressable>
  );
}

export function Panel({children, style}: {children: React.ReactNode; style?: StyleProp<ViewStyle>}) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

export function Chip({label, tone}: {label: string; tone: 'blue' | 'grey'}) {
  return (
    <View style={[styles.chip, {backgroundColor: tone === 'blue' ? colors.blueTint : colors.paper}]}>
      <Txt weight={tone === 'blue' ? 'semibold' : 'regular'} size={14} color={tone === 'blue' ? colors.blue : colors.ink}>
        {label}
      </Txt>
    </View>
  );
}

type IconName = 'card' | 'shield' | 'history' | 'gear' | 'plus' | 'back' | 'check' | 'face' | 'checkCircle' | 'spinner' | 'dot';

export function Icon({name, size = 24, color = colors.ink}: {name: IconName; size?: number; color?: string}) {
  const common = {fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const};
  switch (name) {
    case 'card':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Rect x={3} y={5} width={18} height={14} rx={2} {...common} />
          <Path d="M3 10h18" {...common} />
        </Svg>
      );
    case 'shield':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z" {...common} />
          <Path d="M8.5 12l2.5 2.5 4.5-5" {...common} />
        </Svg>
      );
    case 'history':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M3 12a9 9 0 1 0 3-6.7L3 8" {...common} />
          <Path d="M3 3v5h5M12 7v5l3 3" {...common} />
        </Svg>
      );
    case 'gear':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx={12} cy={12} r={3} {...common} />
          <Path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" {...common} />
        </Svg>
      );
    case 'plus':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M12 5v14M5 12h14" {...common} />
        </Svg>
      );
    case 'back':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M15 5l-7 7 7 7" {...common} />
        </Svg>
      );
    case 'check':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M5 12l5 5 9-10" {...common} strokeWidth={2.5} />
        </Svg>
      );
    case 'checkCircle':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx={12} cy={12} r={10} {...common} strokeWidth={2.5} />
          <Path d="M7.5 12l3 3 6-6" {...common} strokeWidth={2.5} />
        </Svg>
      );
    case 'spinner':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx={12} cy={12} r={10} {...common} strokeOpacity={0.25} strokeWidth={2.5} />
          <Path d="M12 2a10 10 0 0 1 10 10" {...common} strokeWidth={2.5} />
        </Svg>
      );
    case 'dot':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx={12} cy={12} r={10} {...common} />
        </Svg>
      );
    case 'face':
      return (
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Path d="M6 20V12a6 6 0 0 1 6-6h8M44 6h8a6 6 0 0 1 6 6v8M58 44v8a6 6 0 0 1-6 6h-8M20 58h-8a6 6 0 0 1-6-6v-8" {...common} strokeWidth={size > 30 ? 3 : 5} />
          <Path d="M22 24v4M42 24v4M32 26v10h-3M24 44c4 4 12 4 16 0" {...common} strokeWidth={size > 30 ? 3 : 5} />
        </Svg>
      );
  }
}

const styles = StyleSheet.create({
  primary: {
    height: 56,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
  },
  textButton: {height: 48, alignItems: 'center', justifyContent: 'center'},
  outline: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panel: {backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 12},
  chip: {borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12},
});
