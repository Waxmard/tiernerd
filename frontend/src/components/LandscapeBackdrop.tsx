import { View } from 'react-native';
import { type ListColor, palette } from '../design-system/tokens/colors';
import { useTheme } from '../providers/ThemeProvider';

export function LandscapeBackdrop({
  variant = 'workspace',
  className = '',
}: {
  variant?: 'workspace' | ListColor | null;
  className?: string;
}) {
  const { scheme, workspaceAppearance } = useTheme();
  const isDark = scheme === 'dark';
  const hue: ListColor =
    variant && variant !== 'workspace' ? variant : workspaceAppearance.accent;
  const sunColor =
    variant && variant !== 'workspace'
      ? palette.list[hue][scheme].solid
      : '#F2B89B';
  const skyColor = isDark ? '#183542' : '#CFE4EE';
  const farRidge = isDark ? '#5A7688' : '#8BA9BC';
  const midRidge = isDark ? '#375966' : '#5E8294';
  const nearRidge = isDark ? '#1B3742' : '#385C6C';

  return (
    <View
      accessible={false}
      pointerEvents="none"
      style={{ backgroundColor: skyColor }}
      className={['overflow-hidden', className].filter(Boolean).join(' ')}
    >
      <View
        style={{
          position: 'absolute',
          width: 88,
          height: 88,
          borderRadius: 44,
          right: '16%',
          top: '14%',
          backgroundColor: sunColor,
          opacity: isDark ? 0.85 : 0.9,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: '-12%',
          right: '18%',
          bottom: '-28%',
          height: '78%',
          borderTopLeftRadius: 180,
          borderTopRightRadius: 220,
          backgroundColor: farRidge,
          opacity: 0.72,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: '18%',
          right: '-16%',
          bottom: '-32%',
          height: '72%',
          borderTopLeftRadius: 220,
          borderTopRightRadius: 160,
          backgroundColor: midRidge,
          opacity: 0.88,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: '-8%',
          right: '-8%',
          bottom: '-38%',
          height: '62%',
          borderTopLeftRadius: 240,
          borderTopRightRadius: 240,
          backgroundColor: nearRidge,
        }}
      />
    </View>
  );
}
