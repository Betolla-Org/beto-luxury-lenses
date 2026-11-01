import { Canvas, Circle, Group, LinearGradient, Path, RadialGradient, Rect, TwoPointConicalGradient, vec } from '@shopify/react-native-skia';
import { StyleSheet } from 'react-native';
import { EyeState, Point, lensStyle } from '../../../engine';

const LID_SHADOW = 0.35;

const circlePath = (x: number, y: number, r: number) =>
  `M ${x - r} ${y} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 Z`;

const polygonPath = (points: Point[]) =>
  points.length < 3 ? undefined : `M ${points.map(p => `${p.x} ${p.y}`).join(' L ')} Z`;

/**
 * Skia port of engine/lens-renderer.ts: same recipe (engine/lens-style.ts), clipped to the eye
 * opening with an upper-lid shadow. The overlay is a separate view above the camera, so it cannot
 * blend with the camera pixels the way the web "realistic" mode does.
 */
function Lens({ eye, color, opacity }: { eye: EyeState; color: string; opacity: number }) {
  const { x, y, radius: r } = eye;
  if (r <= 0) return null;

  const style = lensStyle(color);
  const outer = r * style.body.outerRatio;
  const donut = `${circlePath(x, y, outer)} ${circlePath(x, y, r * style.pupilRatio)}`;
  const gx = x + r * style.glare.offsetRatio;
  const gy = y + r * style.glare.offsetRatio;
  const lidTop = eye.outline.length ? Math.min(...eye.outline.map(p => p.y)) : y - r;

  return (
    <Group opacity={opacity} clip={polygonPath(eye.outline)}>
      {/* 1. Outer limbal ring for definition and depth */}
      <Circle cx={x} cy={y} r={r} style="stroke" strokeWidth={r * style.ring.widthRatio} color={style.ring.color} />
      {/* 2. Main color as a donut, leaving the pupil clear */}
      <Path path={donut} fillType="evenOdd">
        <TwoPointConicalGradient
          start={vec(x, y)}
          startR={r * style.body.gradientInnerRatio}
          end={vec(x, y)}
          endR={outer}
          colors={style.body.stops.map(s => s.color)}
          positions={style.body.stops.map(s => s.offset)}
        />
      </Path>
      {/* 3. Subtle glare for realism */}
      <Path path={donut} fillType="evenOdd">
        <RadialGradient c={vec(gx, gy)} r={r * style.glare.radiusRatio} colors={[style.glare.color, style.glare.fade]} />
      </Path>
      {/* 4. Upper-lid shadow over the top of the lens */}
      <Group clip={circlePath(x, y, r)}>
        <Rect x={x - r} y={lidTop} width={2 * r} height={r * 0.7}>
          <LinearGradient
            start={vec(0, lidTop)}
            end={vec(0, lidTop + r * 0.7)}
            colors={[`rgba(0, 0, 0, ${LID_SHADOW})`, 'rgba(0, 0, 0, 0)']}
          />
        </Rect>
      </Group>
    </Group>
  );
}

export function LensOverlay({ eyes, color, opacity = 0.65 }: { eyes: EyeState[]; color: string; opacity?: number }) {
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {eyes.map((eye, i) => (
        <Lens key={i} eye={eye} color={color} opacity={opacity} />
      ))}
    </Canvas>
  );
}
