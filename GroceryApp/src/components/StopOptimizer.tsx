/**
 * StopOptimizer — collapsible multi-stop route optimization UI.
 *
 * Displays proposals below the StoreTotalBar. Returns null if
 * < 2 stores have prices.
 */

import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { PriceResult } from '../pricing/types';
import { computeStopProposals } from '../pricing/stop-optimizer';

interface StopOptimizerProps {
  items: { id: string; quantity: number }[];
  perStorePrices: Record<string, Record<string, PriceResult>>;
  storeNameMap: Record<string, string>;
  storeIds: string[];
}

export default function StopOptimizer({
  items,
  perStorePrices,
  storeNameMap,
}: StopOptimizerProps) {
  const [expanded, setExpanded] = useState(false);

  const proposals = useMemo(
    () => computeStopProposals(items, perStorePrices, storeNameMap),
    [items, perStorePrices, storeNameMap],
  );

  if (proposals.length < 2) return null;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded((prev) => !prev)}
        activeOpacity={0.7}
      >
        <Text style={styles.headerText}>🛒 Best route</Text>
        <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {expanded && (
        <View style={styles.body}>
          {proposals.map((prop) => (
            <View key={prop.numStops} style={styles.row}>
              <Text style={styles.leader}>•</Text>
              <Text style={styles.rowText}>
                <Text style={styles.bold}>{prop.numStops}</Text>{' '}
                {prop.numStops === 1 ? 'stop' : 'stops'}:{' '}
                <Text style={styles.bold}>
                  ${prop.totalCost.toFixed(2)}
                </Text>
                {prop.savingsVsOneStop > 0 && (
                  <Text style={styles.savings}>
                    {' '}(save ${prop.savingsVsOneStop.toFixed(2)})
                  </Text>
                )}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 12,
    marginBottom: 8,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  headerText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
  },
  chevron: {
    fontSize: 12,
    color: '#999',
  },
  body: {
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
  },
  leader: {
    fontSize: 14,
    color: '#4CAF50',
    marginRight: 8,
  },
  rowText: {
    fontSize: 13,
    color: '#555',
    flex: 1,
  },
  bold: {
    fontWeight: '700',
  },
  savings: {
    color: '#4CAF50',
  },
});
