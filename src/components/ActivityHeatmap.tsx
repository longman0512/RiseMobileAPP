import React, { useEffect, useMemo, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  buildHeatmapDays,
  focusIntensityLabel,
  type HeatmapDay,
} from '../lib/sessionAnalytics';
import type { SessionRecord } from '../lib/sessionApi';

type Props = {
  sessions: SessionRecord[];
  onDayPress?: (date: string, daySessions: SessionRecord[]) => void;
};

const CELL_SIZE = 18;
const CELL_GAP = 2;

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getMonthAbbr(dateStr?: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleString(undefined, { month: 'short' });
}

type MonthLabel = { show: boolean; date?: string };

function monthKey(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return `${d.getFullYear()}-${d.getMonth()}`;
}

/**
 * One label per calendar month: on the week that contains the 1st (GitHub-style).
 * If the range starts mid-month, label the first column once for that month only.
 */
function computeMonthLabels(
  weekCols: Array<Array<HeatmapDay | undefined>>,
): MonthLabel[] {
  const labels: MonthLabel[] = weekCols.map(() => ({ show: false }));
  const shown = new Set<string>();

  weekCols.forEach((week, colIdx) => {
    const firstOfMonth = week.find(
      (d) => d && new Date(d.date + 'T12:00:00').getDate() === 1,
    );
    if (firstOfMonth) {
      const key = monthKey(firstOfMonth.date);
      if (!shown.has(key)) {
        labels[colIdx] = { show: true, date: firstOfMonth.date };
        shown.add(key);
      }
      return;
    }

    if (colIdx === 0) {
      const firstDay = week.find((d) => d != null);
      if (firstDay?.date) {
        const key = monthKey(firstDay.date);
        if (!shown.has(key)) {
          labels[colIdx] = { show: true, date: firstDay.date };
          shown.add(key);
        }
      }
    }
  });

  return labels;
}

function getCellStyle(intensity: number) {
  if (intensity === 0) return styles.cell0;
  if (intensity === 1) return styles.cell1;
  if (intensity === 2) return styles.cell2;
  if (intensity === 3) return styles.cell3;
  return styles.cell4;
}

export function ActivityHeatmap({ sessions, onDayPress }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const data = useMemo(() => buildHeatmapDays(sessions, 90), [sessions]);

  const weekCols = useMemo(() => {
    if (data.length === 0) return [];

    const firstDayOfWeek = new Date(data[0].date + 'T12:00:00').getDay();
    const padStart = new Array(firstDayOfWeek).fill(undefined) as Array<HeatmapDay | undefined>;
    const paddedData: Array<HeatmapDay | undefined> = [...padStart, ...data];

    const cols: Array<Array<HeatmapDay | undefined>> = [];
    for (let i = 0; i < paddedData.length; i += 7) {
      cols.push(paddedData.slice(i, i + 7));
    }
    return cols;
  }, [data]);

  const monthLabels = useMemo(() => computeMonthLabels(weekCols), [weekCols]);

  useEffect(() => {
    if (weekCols.length === 0) return;
    const id = requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: false });
    });
    return () => cancelAnimationFrame(id);
  }, [weekCols.length]);

  return (
    <View className="w-full">
      <View className="flex-row">
        <View style={styles.labelCol}>
          {DAYS_OF_WEEK.map((day) => (
            <View key={day} style={styles.labelCell}>
              <Text className="text-zinc-500 text-[10px]" style={styles.labelText}>
                {day}
              </Text>
            </View>
          ))}
          <View style={styles.monthRowSpacer} />
        </View>

        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.weekScroll}
          contentContainerStyle={styles.scrollContent}
        >
          <View className="flex-row" style={styles.gridRow}>
            {weekCols.map((week, colIdx) => {
              const monthLabel = monthLabels[colIdx];

              return (
                <View key={`w-${colIdx}`} style={styles.weekCol}>
                  {DAYS_OF_WEEK.map((_, rowIdx) => {
                    const dateObj = week[rowIdx];
                    if (!dateObj) {
                      return <View key={`empty-${colIdx}-${rowIdx}`} style={styles.cellHidden} />;
                    }

                    const hasSessions = dateObj.sessions.length > 0;
                    const showDot = dateObj.intensity > 0 || hasSessions;

                    if (!showDot) {
                      return (
                        <View key={`empty-day-${colIdx}-${rowIdx}`} style={styles.cellEmpty} />
                      );
                    }

                    return (
                      <Pressable
                        key={`pt-${colIdx}-${rowIdx}`}
                        disabled={!hasSessions}
                        onPress={() => {
                          if (hasSessions && onDayPress) {
                            onDayPress(dateObj.date, dateObj.sessions);
                          }
                        }}
                        style={[
                          styles.cellBase,
                          dateObj.intensity > 0
                            ? getCellStyle(dateObj.intensity)
                            : styles.cellEmpty,
                        ]}
                        accessibilityLabel={`${dateObj.date}: ${focusIntensityLabel(dateObj.intensity)}`}
                      />
                    );
                  })}

                  <View style={styles.monthCell}>
                    <Text className="text-zinc-500 text-[11px] font-semibold" numberOfLines={1}>
                      {monthLabel.show && monthLabel.date ? getMonthAbbr(monthLabel.date) : ''}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
      </View>

      <View className="flex-row items-center gap-2 mt-3">
        <Text className="text-zinc-500 text-xs">Less</Text>
        <View className="flex-row" style={styles.legendRow}>
          {[0, 1, 2, 3, 4].map((i) => (
            <View key={`legend-${i}`} style={[styles.legendCell, getCellStyle(i)]} />
          ))}
        </View>
        <Text className="text-zinc-500 text-xs">More</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 2,
  },
  weekScroll: {
    flex: 1,
  },
  gridRow: {
    gap: CELL_GAP,
  },
  labelCol: {
    paddingRight: 6,
    flexShrink: 0,
  },
  labelCell: {
    width: 28,
    height: CELL_SIZE,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  labelText: {
    lineHeight: 12,
  },
  monthRowSpacer: {
    height: CELL_SIZE,
    marginTop: 5,
  },
  weekCol: {
    gap: CELL_GAP,
    overflow: 'visible',
  },
  cellBase: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderRadius: CELL_SIZE,
  },
  cellEmpty: {
    width: CELL_SIZE,
    height: CELL_SIZE,
  },
  cellHidden: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    opacity: 0,
  },
  monthCell: {
    minWidth: 28,
    height: CELL_SIZE,
    marginTop: 5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  legendRow: {
    gap: 4,
  },
  legendCell: {
    width: 12,
    height: 12,
    borderRadius: 12,
  },

  cell0: {
    backgroundColor: 'rgba(39, 39, 42, 0.35)',
  },
  cell1: {
    backgroundColor: 'rgba(34, 211, 238, 0.20)',
  },
  cell2: {
    backgroundColor: 'rgba(34, 211, 238, 0.40)',
  },
  cell3: {
    backgroundColor: 'rgba(34, 211, 238, 0.70)',
  },
  cell4: {
    backgroundColor: 'rgba(34, 211, 238, 1)',
  },
});
