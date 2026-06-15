import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';

type Props = {
  minMinutes: number;
  maxMinutes: number;
  stepMinutes?: number;
  value: number;
  onChange: (minutes: number) => void;
};

const THUMB_SIZE = 28;
const TRACK_HIT_HEIGHT = 48;

function buildSteps(min: number, max: number, step: number): number[] {
  const steps: number[] = [];
  for (let m = min; m <= max; m += step) {
    steps.push(m);
  }
  return steps;
}

function nearestStep(value: number, steps: number[]): number {
  let best = steps[0];
  let bestDist = Math.abs(value - best);
  for (const s of steps) {
    const d = Math.abs(value - s);
    if (d < bestDist) {
      best = s;
      bestDist = d;
    }
  }
  return best;
}

function snapToStep(minutes: number, min: number, max: number, step: number): number {
  const clamped = Math.min(max, Math.max(min, minutes));
  const snapped = Math.round(clamped / step) * step;
  return Math.min(max, Math.max(min, snapped));
}

function stepIndexForMinutes(minutes: number, steps: number[]): number {
  const idx = steps.indexOf(minutes);
  return idx >= 0 ? idx : 0;
}

function minutesForStepIndex(index: number, steps: number[]): number {
  const clamped = Math.max(0, Math.min(steps.length - 1, index));
  return steps[clamped];
}

function stepIndexFromX(x: number, trackWidth: number, stepCount: number): number {
  if (stepCount <= 1) return 0;
  const travel = trackWidth - THUMB_SIZE;
  if (travel <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, (x - THUMB_SIZE / 2) / travel));
  return Math.round(ratio * (stepCount - 1));
}

function thumbLeftForIndex(index: number, trackWidth: number, stepCount: number): number {
  if (stepCount <= 1) return 0;
  const travel = Math.max(0, trackWidth - THUMB_SIZE);
  return (index / (stepCount - 1)) * travel;
}

export function DurationSlider({
  minMinutes,
  maxMinutes,
  stepMinutes = 1,
  value,
  onChange,
}: Props) {
  const steps = useMemo(
    () => buildSteps(minMinutes, maxMinutes, stepMinutes),
    [maxMinutes, minMinutes, stepMinutes],
  );

  const [trackWidth, setTrackWidth] = useState(0);
  const [displayMinutes, setDisplayMinutes] = useState(value);
  const dragStartIndexRef = useRef(0);
  const trackWidthRef = useRef(0);
  const stepsRef = useRef(steps);
  const displayMinutesRef = useRef(displayMinutes);
  const valueRef = useRef(value);

  stepsRef.current = steps;
  displayMinutesRef.current = displayMinutes;
  valueRef.current = value;
  trackWidthRef.current = trackWidth;

  useEffect(() => {
    setDisplayMinutes(snapToStep(value, minMinutes, maxMinutes, stepMinutes));
  }, [maxMinutes, minMinutes, stepMinutes, value]);

  const applyStepIndex = useCallback(
    (index: number) => {
      const minutes = minutesForStepIndex(index, stepsRef.current);
      setDisplayMinutes(minutes);
      if (minutes !== valueRef.current) {
        onChange(minutes);
      }
    },
    [onChange],
  );

  const stepIndex = stepIndexForMinutes(displayMinutes, steps);
  const thumbLeft = thumbLeftForIndex(stepIndex, trackWidth, steps.length);
  const fillRatio = steps.length <= 1 ? 0 : stepIndex / (steps.length - 1);

  const trackPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => false,
        onPanResponderGrant: (evt) => {
          const x = evt.nativeEvent.locationX;
          applyStepIndex(
            stepIndexFromX(x, trackWidthRef.current, stepsRef.current.length),
          );
        },
      }),
    [applyStepIndex],
  );

  const thumbPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          dragStartIndexRef.current = stepIndexForMinutes(
            displayMinutesRef.current,
            stepsRef.current,
          );
        },
        onPanResponderMove: (_, gesture) => {
          const travel = trackWidthRef.current - THUMB_SIZE;
          if (travel <= 0 || stepsRef.current.length <= 1) return;
          const deltaIndex =
            (gesture.dx / travel) * (stepsRef.current.length - 1);
          const next = Math.round(dragStartIndexRef.current + deltaIndex);
          applyStepIndex(next);
        },
      }),
    [applyStepIndex],
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    trackWidthRef.current = w;
    setTrackWidth(w);
  };

  return (
    <View className="w-full">
      <Text className="text-white text-5xl font-bold text-center tabular-nums">{displayMinutes}</Text>
      <Text className="text-zinc-500 text-center text-sm mt-1 mb-6">minutes</Text>

      <View
        className="justify-center"
        style={{ height: TRACK_HIT_HEIGHT }}
        onLayout={onLayout}
      >
        <View
          className="absolute left-0 right-0 justify-center"
          style={{ height: TRACK_HIT_HEIGHT }}
          {...trackPanResponder.panHandlers}
        >
          <View className="h-1.5 rounded-full bg-white/15 overflow-hidden">
            <View
              className="h-1.5 rounded-full bg-amber-400"
              style={{ width: `${fillRatio * 100}%` }}
            />
          </View>
        </View>

        <View
          className="absolute w-7 h-7 rounded-full bg-white border-2 border-amber-400 shadow-lg"
          style={{
            left: thumbLeft,
            top: (TRACK_HIT_HEIGHT - THUMB_SIZE) / 2,
          }}
          {...thumbPanResponder.panHandlers}
        />
      </View>

      <View className="flex-row justify-between mt-2 px-0.5">
        <Text className="text-zinc-600 text-xs">{minMinutes}m</Text>
        <Text className="text-zinc-600 text-xs">{maxMinutes}m</Text>
      </View>
    </View>
  );
}

/** Snap an arbitrary minute value to the slider grid. */
export function snapDurationMinutes(
  minutes: number,
  minMinutes: number,
  maxMinutes: number,
  stepMinutes = 1,
): number {
  const steps = buildSteps(minMinutes, maxMinutes, stepMinutes);
  const clamped = Math.min(maxMinutes, Math.max(minMinutes, minutes));
  return nearestStep(clamped, steps);
}
