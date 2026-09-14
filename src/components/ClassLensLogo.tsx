import { View } from 'react-native';
import Svg, {
  Circle,
  Rect,
  Text as SvgText,
  TSpan,
} from 'react-native-svg';

type Props = {
  size?: number;
  compact?: boolean;
  showWordmark?: boolean;
};

export function ClassLensLogo({
  size,
  compact = false,
  showWordmark = true,
}: Props) {
  const resolvedSize = size ?? (compact ? 48 : 120);

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="ClassLens"
    >
      <Svg
        width={resolvedSize}
        height={resolvedSize}
        viewBox="0 0 512 512"
      >
        <Rect
          width="512"
          height="512"
          rx="115"
          fill="#4A7C59"
        />

        <Circle
          cx="256"
          cy="176"
          r="92"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="13"
        />

        <Circle
          cx="256"
          cy="176"
          r="63"
          fill="none"
          stroke="#C4A66A"
          strokeWidth="10"
        />

        <Circle
          cx="256"
          cy="176"
          r="32"
          fill="#FFFFFF"
        />

        <Circle
          cx="256"
          cy="176"
          r="16"
          fill="#4A7C59"
        />

        <Circle
          cx="256"
          cy="62"
          r="8"
          fill="#C4A66A"
        />

        <Rect
          x="156"
          y="294"
          width="200"
          height="11"
          rx="5.5"
          fill="#FFFFFF"
        />

        <Rect
          x="181"
          y="318"
          width="150"
          height="11"
          rx="5.5"
          fill="#C4A66A"
        />

        <Rect
          x="206"
          y="342"
          width="100"
          height="11"
          rx="5.5"
          fill="#FFFFFF"
          opacity="0.85"
        />

        {showWordmark ? (
          <SvgText
            x="256"
            y="428"
            textAnchor="middle"
            fontFamily="JetBrains Mono"
            fontSize="42"
            fontWeight="700"
            fill="#FFFFFF"
          >
            Class
            <TSpan fill="#C4A66A">
              Lens
            </TSpan>
          </SvgText>
        ) : null}
      </Svg>
    </View>
  );
}
