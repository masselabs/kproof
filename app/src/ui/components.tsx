import React from 'react';
import {Modal, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle} from 'react-native';
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

/** A button inside content (not a screen's main call to action): outline or filled, 48pt high. */
export function InlineButton(props: {
  label: string;
  onPress: () => void;
  variant?: 'outline' | 'filled';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const filled = props.variant === 'filled';
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole="button"
      accessibilityState={{disabled: props.disabled === true}}
      disabled={props.disabled}
      onPress={props.onPress}
      style={({pressed}) => [
        styles.inline,
        filled ? styles.inlineFilled : styles.inlineOutline,
        {opacity: props.disabled ? 0.4 : pressed ? 0.75 : 1},
        props.style,
      ]}>
      <Txt weight={filled ? 'bold' : 'semibold'} size={15} color={filled ? colors.white : colors.ink} numberOfLines={1}>
        {props.label}
      </Txt>
    </Pressable>
  );
}

export function OutlineButton(props: {label: string; onPress: () => void; disabled?: boolean; style?: StyleProp<ViewStyle>; testID?: string}) {
  return <InlineButton {...props} variant="outline" />;
}

/**
 * A destructive action: trash icon and a short red label on a red tint, so it
 * reads as a button and never as a sentence. It only opens a ConfirmSheet; the
 * removal itself happens there.
 */
export function DestructiveButton(props: {label: string; onPress: () => void; testID?: string; style?: StyleProp<ViewStyle>}) {
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      onPress={props.onPress}
      style={({pressed}) => [styles.destructive, {opacity: pressed ? 0.7 : 1}, props.style]}>
      <Icon name="trash" size={18} color={colors.red} />
      <Txt weight="semibold" size={15} color={colors.red} numberOfLines={1}>
        {props.label}
      </Txt>
    </Pressable>
  );
}

/** The bottom sheet every destructive action goes through: what happens, then a red confirm and a cancel. */
export function ConfirmSheet(props: {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  testID?: string;
}) {
  return (
    <Modal transparent visible={props.visible} animationType="fade" onRequestClose={props.onCancel}>
      <View style={styles.scrim}>
        <View style={styles.sheet} testID={props.testID}>
          <Txt weight="bold" size={20}>
            {props.title}
          </Txt>
          <Txt size={15} color={colors.muted}>
            {props.body}
          </Txt>
          <View style={styles.sheetGap} />
          <PrimaryButton label={props.confirmLabel} color={colors.red} onPress={props.onConfirm} testID={props.testID ? `${props.testID}-confirm` : undefined} />
          <TextButton label={props.cancelLabel} onPress={props.onCancel} testID={props.testID ? `${props.testID}-cancel` : undefined} />
        </View>
      </View>
    </Modal>
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

type IconName = 'trash' | 'chevronDown' | 'chevronRight' | 'card' | 'shield' | 'history' | 'gear' | 'plus' | 'back' | 'close' | 'scan' | 'check' | 'face' | 'checkCircle' | 'spinner' | 'dot';

export function Icon({name, size = 24, color = colors.ink}: {name: IconName; size?: number; color?: string}) {
  const common = {fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const};
  switch (name) {
    case 'trash':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          {/* After Lucide's "trash-2" icon (ISC licence). */}
          <Path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" {...common} />
        </Svg>
      );
    case 'chevronDown':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M6 9l6 6 6-6" {...common} />
        </Svg>
      );
    case 'chevronRight':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M9 6l6 6-6 6" {...common} />
        </Svg>
      );
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
          {/* Gear outline from Lucide's "settings" icon (ISC licence). */}
          <Path
            d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
            {...common}
          />
          <Circle cx={12} cy={12} r={3} {...common} />
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
    case 'close':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M6 6l12 12M18 6L6 18" {...common} />
        </Svg>
      );
    case 'scan':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          {/* Viewfinder corners and a scan line, after Lucide's "scan-line" icon (ISC licence). */}
          <Path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10" {...common} />
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
  inline: {height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12},
  inlineOutline: {borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card},
  inlineFilled: {backgroundColor: colors.blue},
  destructive: {
    alignSelf: 'center',
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: colors.redTint,
  },
  scrim: {flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end'},
  sheet: {backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, gap: 8},
  sheetGap: {height: 4},
  panel: {backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 12},
  chip: {borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12},
});
