import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { colors, radius, space, statusColor, statusLabel } from '@/lib/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

type TextVariant = 'title' | 'heading' | 'body' | 'dim' | 'small' | 'label' | 'mono';

export function Text({
  variant = 'body',
  style,
  children,
  numberOfLines,
  selectable,
  onPress,
}: {
  variant?: TextVariant;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
  numberOfLines?: number;
  selectable?: boolean;
  onPress?: () => void;
}) {
  return (
    <RNText style={[textStyles[variant], style]} numberOfLines={numberOfLines} selectable={selectable} onPress={onPress}>
      {children}
    </RNText>
  );
}

const textStyles = StyleSheet.create({
  title: { color: colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  heading: { color: colors.text, fontSize: 17, fontWeight: '700' },
  body: { color: colors.text, fontSize: 15, lineHeight: 21 },
  dim: { color: colors.textDim, fontSize: 14, lineHeight: 20 },
  small: { color: colors.textDim, fontSize: 12 },
  label: { color: colors.textDim, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  mono: { color: colors.text, fontSize: 12, fontFamily: 'monospace' },
});

export function Screen({
  children,
  refreshing,
  onRefresh,
  scroll = true,
  contentStyle,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  if (!scroll) return <View style={[styles.screen, styles.screenContent, contentStyle]}>{children}</View>;
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.screenContent, contentStyle]}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.textDim} /> : undefined}>
      <View style={styles.maxWidth}>{children}</View>
    </ScrollView>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Row({ children, style, gap = space.sm }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  style,
  small,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'ghost';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}) {
  const bg = {
    primary: colors.primary,
    secondary: colors.surfaceAlt,
    danger: colors.danger,
    success: colors.success,
    ghost: 'transparent',
  }[variant];
  const fg = variant === 'secondary' || variant === 'ghost' ? colors.text : '#fff';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: bg, opacity: disabled ? 0.5 : 1 },
        variant === 'secondary' && { borderWidth: 1, borderColor: colors.border },
        pressed && styles.pressed,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Row gap={6} style={{ justifyContent: 'center' }}>
          {icon && <Ionicons name={icon} size={small ? 15 : 18} color={fg} />}
          <RNText style={{ color: fg, fontWeight: '700', fontSize: small ? 13 : 15 }}>{title}</RNText>
        </Row>
      )}
    </Pressable>
  );
}

export function Input({ label, hint, style, ...props }: TextInputProps & { label?: string; hint?: string }) {
  return (
    <View style={{ gap: 6 }}>
      {label && <Text variant="label">{label}</Text>}
      <TextInput
        placeholderTextColor={colors.textFaint}
        {...props}
        style={[styles.input, props.multiline && { minHeight: 110, textAlignVertical: 'top' }, style]}
      />
      {hint && <Text variant="small">{hint}</Text>}
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  icon,
  color = colors.primary,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  color?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && { backgroundColor: color + '33', borderColor: color },
        pressed && styles.pressed,
      ]}>
      <Row gap={4}>
        {icon && <Ionicons name={icon} size={14} color={selected ? colors.text : colors.textDim} />}
        <RNText style={{ color: selected ? colors.text : colors.textDim, fontSize: 13, fontWeight: '600' }}>{label}</RNText>
      </Row>
    </Pressable>
  );
}

export function StatusPill({ status }: { status: string }) {
  const c = statusColor[status] ?? colors.textDim;
  return (
    <View style={[styles.pill, { backgroundColor: c + '22' }]}>
      <View style={[styles.dot, { backgroundColor: c }]} />
      <RNText style={{ color: c, fontSize: 12, fontWeight: '700' }}>{statusLabel[status] ?? status}</RNText>
    </View>
  );
}

export function Avatar({ emoji, color, size = 44 }: { emoji: string; color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: color + '33', alignItems: 'center', justifyContent: 'center' }}>
      <RNText style={{ fontSize: size * 0.5 }}>{emoji}</RNText>
    </View>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <View style={{ gap: space.sm, marginTop: space.lg }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text variant="label">{title}</Text>
        {action}
      </Row>
      {children}
    </View>
  );
}

export function Empty({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', padding: space.xxl, gap: space.sm }}>
      <Ionicons name={icon} size={40} color={colors.textFaint} />
      <Text variant="heading">{title}</Text>
      {body && <Text variant="dim" style={{ textAlign: 'center' }}>{body}</Text>}
      {action && <View style={{ marginTop: space.sm }}>{action}</View>}
    </View>
  );
}

export function Loading() {
  return (
    <View style={[styles.screen, { alignItems: 'center', justifyContent: 'center' }]}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <View style={styles.error}>
      <Ionicons name="alert-circle" size={18} color={colors.danger} />
      <Text style={{ color: colors.danger, flex: 1 }}>{(error as Error).message ?? String(error)}</Text>
    </View>
  );
}

export function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Card style={{ flex: 1, minWidth: 140, gap: 4 }}>
      <Text variant="small">{label}</Text>
      <Text style={{ fontSize: 24, fontWeight: '800', color: color ?? colors.text }}>{value}</Text>
    </Card>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  screenContent: { padding: space.lg, paddingBottom: 48 },
  maxWidth: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: space.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
  },
  pressed: { opacity: 0.7 },
  button: { borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: space.lg, alignItems: 'center', justifyContent: 'center' },
  buttonSmall: { paddingVertical: 8, paddingHorizontal: space.md },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: space.md,
    paddingVertical: 12,
  },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.md,
    paddingVertical: 7,
    backgroundColor: colors.surface,
  },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  dot: { width: 7, height: 7, borderRadius: 4 },
  error: { flexDirection: 'row', gap: space.sm, alignItems: 'center', backgroundColor: colors.danger + '1A', borderRadius: radius.md, padding: space.md },
});
