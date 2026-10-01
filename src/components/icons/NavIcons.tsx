import Svg, { Circle, Path } from 'react-native-svg';

type IconProps = { color: string; size?: number };

const STROKE_WIDTH = 1.8;

export function HomeIcon({ color, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 11.5 12 4l8 7.5"
        stroke={color}
        strokeWidth={STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M6 10v8.5a1 1 0 0 0 1 1h3.5v-5h3v5H17a1 1 0 0 0 1-1V10"
        stroke={color}
        strokeWidth={STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function BookIcon({ color, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 5.5C5 4.67 5.67 4 6.5 4H12v16H6.5A1.5 1.5 0 0 1 5 18.5v-13Z"
        stroke={color}
        strokeWidth={STROKE_WIDTH}
        strokeLinejoin="round"
      />
      <Path
        d="M19 5.5c0-.83-.67-1.5-1.5-1.5H12v16h5.5a1.5 1.5 0 0 0 1.5-1.5v-13Z"
        stroke={color}
        strokeWidth={STROKE_WIDTH}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function PeopleIcon({ color, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="8.5" cy="8" r="3" stroke={color} strokeWidth={STROKE_WIDTH} />
      <Path
        d="M3 19c0-2.76 2.46-5 5.5-5S14 16.24 14 19"
        stroke={color}
        strokeWidth={STROKE_WIDTH}
        strokeLinecap="round"
      />
      <Path
        d="M15 5.1c1.44.35 2.5 1.6 2.5 3.1s-1.06 2.75-2.5 3.1"
        stroke={color}
        strokeWidth={STROKE_WIDTH}
        strokeLinecap="round"
      />
      <Path
        d="M16 14.2c1.98.52 3.5 2.27 3.5 4.8"
        stroke={color}
        strokeWidth={STROKE_WIDTH}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function PersonIcon({ color, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="8" r="3.5" stroke={color} strokeWidth={STROKE_WIDTH} />
      <Path
        d="M5 20c0-3.59 3.13-6.5 7-6.5s7 2.91 7 6.5"
        stroke={color}
        strokeWidth={STROKE_WIDTH}
        strokeLinecap="round"
      />
    </Svg>
  );
}
