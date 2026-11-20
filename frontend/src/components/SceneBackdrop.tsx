import { type DimensionValue, View } from 'react-native';
import type { ColorSchemeName } from '../design-system/tokens/colors';
import { useTheme } from '../providers/ThemeProvider';
import type { WorkspaceScene } from '../services/themePreference';

type Shape = [
  DimensionValue,
  DimensionValue,
  DimensionValue,
  DimensionValue,
  number,
  number,
  string,
  number,
];
type Sun = [number, DimensionValue, DimensionValue, string, number];
type Scene = { skyColor: string; sky: string; sun: Sun; shapes: Shape[] };

const ridges = (
  far: string,
  mid: string,
  near: string,
  farO = 0.72,
  midO = 0.88
): Shape[] => [
  ['-12%', '18%', '-28%', '78%', 180, 220, far, farO],
  ['18%', '-16%', '-32%', '72%', 220, 160, mid, midO],
  ['-8%', '-8%', '-38%', '62%', 240, 240, near, 1],
];
const hills = (far: string, mid: string, near: string): Shape[] => [
  ['-20%', '30%', '-30%', '76%', 260, 260, far, 0.9],
  ['30%', '-25%', '-34%', '74%', 280, 200, mid, 1],
  ['-15%', '-15%', '-42%', '64%', 300, 300, near, 1],
];
const coast = (sea: string, deep: string, sand: string): Shape[] => [
  ['0%', '0%', '0%', '50%', 0, 0, sea, 1],
  ['0%', '0%', '0%', '38%', 0, 0, deep, 0.9],
  ['-40%', '22%', '-44%', '64%', 420, 420, sand, 1],
];

const SCENES: Record<WorkspaceScene, Record<ColorSchemeName, Scene>> = {
  landscape: {
    light: {
      skyColor: '#CFE4EE',
      sky: 'linear-gradient(180deg, #E6F2FB 0%, #CFE4EE 60%)',
      sun: [88, '9%', '47%', '#F2B89B', 0.9],
      shapes: ridges('#8BA9BC', '#5E8294', '#385C6C'),
    },
    dark: {
      skyColor: '#16313D',
      sky: 'linear-gradient(180deg, #11252E 0%, #16313D 60%)',
      sun: [88, '9%', '47%', '#F3CDB8', 0.3],
      shapes: ridges('#425866', '#2A4550', '#152D37', 1, 1),
    },
  },
  dusk: {
    light: {
      skyColor: '#FBD3BF',
      sky: 'linear-gradient(180deg, #EEF1FF 0%, #F6E4EC 38%, #FBD3BF 62%)',
      sun: [120, '14%', '43%', '#FFE2B8', 1],
      shapes: ridges('#C9A9C4', '#8E77A6', '#4B4476', 0.8, 0.9),
    },
    dark: {
      skyColor: '#51334B',
      sky: 'linear-gradient(180deg, #171A33 0%, #2B2343 40%, #51334B 64%)',
      sun: [120, '14%', '43%', '#F3CDB8', 0.3],
      shapes: ridges('#44375B', '#31274B', '#1F1A35', 1, 1),
    },
  },
  meadow: {
    light: {
      skyColor: '#D9EFF3',
      sky: 'linear-gradient(180deg, #EAF6FF 0%, #D9EFF3 60%)',
      sun: [72, '12%', '44%', '#FFE39A', 1],
      shapes: hills('#B5DCC0', '#7FC29A', '#46976C'),
    },
    dark: {
      skyColor: '#142E2D',
      sky: 'linear-gradient(180deg, #0E2126 0%, #142E2D 60%)',
      sun: [72, '12%', '44%', '#E8F0D8', 0.3],
      shapes: hills('#264C3E', '#1C3E30', '#122E22'),
    },
  },
  shore: {
    light: {
      skyColor: '#D5EBF7',
      sky: 'linear-gradient(180deg, #EAF5FF 0%, #D5EBF7 50%)',
      sun: [96, '12%', '44.5%', '#FFD9A8', 1],
      shapes: coast('#8CC3E0', '#5FA3CB', '#F3E2BF'),
    },
    dark: {
      skyColor: '#162D46',
      sky: 'linear-gradient(180deg, #101E32 0%, #162D46 50%)',
      sun: [96, '12%', '44.5%', '#E6EEF5', 0.3],
      shapes: coast('#1A415A', '#143348', '#4C473A'),
    },
  },
};

export function SceneBackdrop({
  scene,
  className = '',
}: {
  scene: WorkspaceScene;
  className?: string;
}) {
  const { scheme } = useTheme();
  const s = SCENES[scene][scheme];
  const [size, sunRight, sunTop, sunColor, sunOpacity] = s.sun;

  return (
    <View
      accessible={false}
      pointerEvents="none"
      style={{ backgroundColor: s.skyColor, backgroundImage: s.sky }}
      className={['overflow-hidden', className].filter(Boolean).join(' ')}
    >
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          right: sunRight,
          top: sunTop,
          backgroundColor: sunColor,
          opacity: sunOpacity,
        }}
      />
      {s.shapes.map(([left, right, bottom, height, rl, rr, color, opacity]) => (
        <View
          key={`${left}|${bottom}|${height}`}
          style={{
            position: 'absolute',
            left,
            right,
            bottom,
            height,
            borderTopLeftRadius: rl,
            borderTopRightRadius: rr,
            backgroundColor: color,
            opacity,
          }}
        />
      ))}
    </View>
  );
}
