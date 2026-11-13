import { Text, View } from 'react-native';

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
