import { type ReactNode, useRef } from 'react';
import { type StyleProp, Text, View, type ViewStyle } from 'react-native';
import Animated, {
  BounceIn,
  Keyframe,
  LinearTransition,
} from 'react-native-reanimated';

const SPARK_BASE_SIZE = 28;
const EMOJI_POP = BounceIn.duration(500);
export const EMOJI_SLIDE = LinearTransition.duration(250);
const SPARKS = [
  { dx: -24, dy: -20 },
  { dx: 24, dy: -20 },
  { dx: -26, dy: 14 },
  { dx: 26, dy: 14 },
].map(({ dx, dy }, index) => ({
  key: `${dx}:${dy}`,
  burst: new Keyframe({
    0: {
      opacity: 0,
      transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 0.4 }],
    },
    35: {
      opacity: 1,
      transform: [
        { translateX: dx * 0.7 },
        { translateY: dy * 0.7 },
        { scale: 1 },
      ],
    },
    100: {
      opacity: 0,
      transform: [{ translateX: dx }, { translateY: dy }, { scale: 0.5 }],
    },
  })
    .duration(650)
    .delay(150 + index * 40),
}));

interface EmojiProps {
  symbol: string;
  size?: number;
  dimmed?: boolean;
}

export function Emoji({ symbol, size = 20, dimmed = false }: EmojiProps) {
  return (
    <Text
      accessible={false}
      maxFontSizeMultiplier={1.5}
      style={{
        fontSize: size,
        lineHeight: Math.round(size * 1.3),
        opacity: dimmed ? 0.4 : 1,
      }}
    >
      {symbol}
    </Text>
  );
}

interface SectionLabelProps {
  label: string;
  emoji?: string;
  nativeID?: string;
  className?: string;
}

export function SectionLabel({
  label,
  emoji,
  nativeID,
  className = '',
}: SectionLabelProps) {
  return (
    <View className={['flex-row items-center gap-1', className].join(' ')}>
      {emoji ? <Emoji symbol={emoji} size={14} /> : null}
      <Text
        nativeID={nativeID}
        className="text-label-large font-semibold text-ink-muted dark:text-ink-muted-dark"
      >
        {label}
      </Text>
    </View>
  );
}

export function useEmojiArrival(present: boolean): boolean {
  const wasAbsent = useRef(false);
  if (!present) wasAbsent.current = true;
  return present && wasAbsent.current;
}

interface EmojiPopProps {
  celebrate: boolean;
  size: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}

export function EmojiPop({ celebrate, size, style, children }: EmojiPopProps) {
  return (
    <View style={style}>
      <Animated.View entering={celebrate ? EMOJI_POP : undefined}>
        {children}
      </Animated.View>
      {celebrate ? (
        <View
          accessible={false}
          pointerEvents="none"
          className="absolute inset-0 items-center justify-center"
          style={{ transform: [{ scale: size / SPARK_BASE_SIZE }] }}
        >
          {SPARKS.map((spark) => (
            <Animated.Text
              key={spark.key}
              accessible={false}
              allowFontScaling={false}
              entering={spark.burst}
              style={{ position: 'absolute', opacity: 0, fontSize: 12 }}
            >
              ✨
            </Animated.Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}
