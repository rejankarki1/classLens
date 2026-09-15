import Svg, {
  Circle,
  Line,
} from 'react-native-svg';

type ClassLensBrandMarkProps = {
  size?: number;
};

export function ClassLensBrandMark({
  size = 42,
}: ClassLensBrandMarkProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      accessibilityRole="image"
      accessibilityLabel="ClassLens logo"
    >
      {/* Forest background */}
      <Circle
        cx="50"
        cy="50"
        r="49"
        fill="#4A7C59"
      />

      {/* Small gold focus point */}
      <Circle
        cx="50"
        cy="13"
        r="3.5"
        fill="#C4A66A"
      />

      {/* Outer lens ring */}
      <Circle
        cx="50"
        cy="42"
        r="25"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="5"
      />

      {/* Gold inner lens ring */}
      <Circle
        cx="50"
        cy="42"
        r="17"
        fill="none"
        stroke="#C4A66A"
        strokeWidth="4"
      />

      {/* Center lens */}
      <Circle
        cx="50"
        cy="42"
        r="8"
        fill="#FFFFFF"
      />

      <Circle
        cx="50"
        cy="42"
        r="4"
        fill="#4A7C59"
      />

      {/* Lens / note lines */}
      <Line
        x1="28"
        y1="72"
        x2="72"
        y2="72"
        stroke="#FFFFFF"
        strokeWidth="4"
        strokeLinecap="round"
      />

      <Line
        x1="34"
        y1="80"
        x2="66"
        y2="80"
        stroke="#C4A66A"
        strokeWidth="4"
        strokeLinecap="round"
      />

      <Line
        x1="40"
        y1="88"
        x2="60"
        y2="88"
        stroke="#FFFFFF"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </Svg>
  );
}
