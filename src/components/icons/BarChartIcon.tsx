import React from 'react';
import Svg, { Rect } from 'react-native-svg';

type Props = {
  size?: number;
  color?: string;
};

export function BarChartIcon({ size = 20, color = 'currentColor' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={12} width={3} height={8} rx={1} fill={color} />
      <Rect x={9} y={8} width={3} height={12} rx={1} fill={color} />
      <Rect x={15} y={4} width={3} height={16} rx={1} fill={color} />
    </Svg>
  );
}

