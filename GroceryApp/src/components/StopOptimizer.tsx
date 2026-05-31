/**
 * StopOptimizer — collapsible multi-stop route optimization UI.
 *
 * Displays proposals below the StoreTotalBar. Returns null if
 * < 2 stores have prices.
 */

import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import type { PriceResult } from '../pricing/types';
import { computeStopProposals } from '../pricing/stop-optimizer';
import { useActiveTheme } from '../state/useThemeStore';

interface StopOptimizerProps {
  items: { id: string; quantity: number }[];
  perStorePrices: Record<string, Record<string, PriceResult>>;
  storeNameMap: Record<string, string>;
  storeIds: string[];
  selectedRouteNumStops?: number | null;
  onSelectRouteNumStops?: (numStops: number | null) => void;
}

const themeColors = {
  light: {
    bg: '#F8FAFC',
    cardBg: '#FFFFFF',
    text: '#0F172A',
    secondaryText: '#64748B',
    border: '#E2E8F0',
    primary: '#10B981',
    savingsBg: '#DEF7EC',
    savingsText: '#03543F',
    bestValueBorder: '#10B981',
    bestValueBg: '#DEF7EC',
    bestValueText: '#03543F',
  },
  dark: {
    bg: '#0B0F19',
    cardBg: '#1E293B',
    text: '#F8FAFC',
    secondaryText: '#94A3B8',
    border: '#334155',
    primary: '#10B981',
    savingsBg: '#0B2518',
    savingsText: '#34D399',
    bestValueBorder: '#10B981',
    bestValueBg: '#0B2518',
    bestValueText: '#34D399',
  },
};

export default function StopOptimizer({
  items,
  perStorePrices,
  storeNameMap,
  selectedRouteNumStops = null,
  onSelectRouteNumStops,
}: StopOptimizerProps) {
  const [expanded, setExpanded] = useState(false);
  const activeTheme = useActiveTheme();
  const theme = themeColors[activeTheme];

  const proposals = useMemo(
    () => computeStopProposals(items, perStorePrices, storeNameMap),
    [items, perStorePrices, storeNameMap],
  );

  if (proposals.length < 2) return null;

  // Max savings is the savings of the last proposal
  const maxSavings = proposals[proposals.length - 1]?.savingsVsOneStop ?? 0;

  return (
    <View style={[styles.container, { backgroundColor: theme.cardBg, borderColor: theme.border }]}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded((prev) => !prev)}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>🗺️ Smart Route Optimizer</Text>
          {maxSavings > 0 && !expanded && (
            <View style={[styles.savingBadgeHeader, { backgroundColor: theme.savingsBg }]}>
              <Text style={[styles.savingBadgeTextHeader, { color: theme.savingsText }]}>
                Save up to ${maxSavings.toFixed(2)}!
              </Text>
            </View>
          )}
        </View>
        <Text style={[styles.chevron, { color: theme.secondaryText }]}>
          {expanded ? '▲' : '▼'}
        </Text>
      </TouchableOpacity>

      {expanded && (
        <View style={[styles.body, { borderTopColor: theme.border }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {proposals.map((prop) => {
              const isSelected = selectedRouteNumStops === prop.numStops;
              // Best value is typically 2 stops when we have >= 2 stops options
              const isBestValue = prop.numStops === 2;

              return (
                <TouchableOpacity
                  key={prop.numStops}
                  style={[
                    styles.card,
                    {
                      backgroundColor: theme.cardBg,
                      borderColor: isSelected
                        ? theme.primary
                        : isBestValue
                        ? theme.bestValueBorder
                        : theme.border,
                      borderWidth: isSelected || isBestValue ? 2 : 1,
                    },
                  ]}
                  onPress={() => onSelectRouteNumStops?.(isSelected ? null : prop.numStops)}
                  activeOpacity={0.8}
                >
                  {isBestValue && (
                    <View style={[styles.bestValueBadge, { backgroundColor: theme.bestValueBg }]}>
                      <Text style={[styles.bestValueText, { color: theme.bestValueText }]}>
                        BEST VALUE
                      </Text>
                    </View>
                  )}
                  <Text style={[styles.cardTitle, { color: theme.text }]}>
                    {prop.numStops} {prop.numStops === 1 ? 'STOP' : 'STOPS'}
                  </Text>
                  <Text style={[styles.cardTotal, { color: theme.text }]}>
                    Est. Total:{' '}
                    <Text style={[styles.bold, { color: theme.text }]}>
                      ${prop.totalCost.toFixed(2)}
                    </Text>
                  </Text>
                  <Text style={[styles.cardStores, { color: theme.secondaryText }]} numberOfLines={2}>
                    {prop.stores.map((s) => s.storeName).join(' + ')}
                  </Text>
                  {prop.savingsVsOneStop > 0 && (
                    <View style={[styles.savingsBadge, { backgroundColor: theme.savingsBg }]}>
                      <Text style={[styles.savingsText, { color: theme.savingsText }]}>
                        * You Save: ${prop.savingsVsOneStop.toFixed(2)}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  savingBadgeHeader: {
    marginLeft: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  savingBadgeTextHeader: {
    fontSize: 10,
    fontWeight: '700',
  },
  chevron: {
    fontSize: 10,
  },
  body: {
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  scrollContent: {
    paddingHorizontal: 12,
    paddingTop: 8, // space for BEST VALUE badge overlay
  },
  card: {
    width: 170,
    padding: 12,
    marginRight: 10,
    borderRadius: 12,
    position: 'relative',
    justifyContent: 'space-between',
    minHeight: 115,
  },
  bestValueBadge: {
    position: 'absolute',
    top: -10,
    right: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#10B981',
  },
  bestValueText: {
    fontSize: 8,
    fontWeight: '900',
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  cardTotal: {
    fontSize: 13,
    marginBottom: 4,
  },
  cardStores: {
    fontSize: 11,
    lineHeight: 14,
    marginBottom: 6,
    flex: 1,
  },
  bold: {
    fontWeight: '700',
  },
  savingsBadge: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  savingsText: {
    fontSize: 10,
    fontWeight: '700',
  },
});
