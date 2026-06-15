/**
 * MaxStopsStepper — compact stepper for selecting max stops (1–5).
 *
 * Renders: [−] [1] [2] [3] [4] [5] [+]
 * Active value is highlighted.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useActiveTheme } from '../state/useThemeStore';

interface MaxStopsStepperProps {
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}

const themeColors = {
  light: {
    text: '#0F172A',
    secondaryText: '#64748B',
    border: '#E2E8F0',
    primary: '#10B981',
    activeBg: '#10B981',
    activeText: '#FFFFFF',
    inactiveBg: '#F1F5F9',
    disabledText: '#CBD5E1',
  },
  dark: {
    text: '#F8FAFC',
    secondaryText: '#94A3B8',
    border: '#334155',
    primary: '#10B981',
    activeBg: '#10B981',
    activeText: '#FFFFFF',
    inactiveBg: '#1E293B',
    disabledText: '#475569',
  },
};

export default function MaxStopsStepper({
  value,
  min = 1,
  max = 5,
  onChange,
}: MaxStopsStepperProps) {
  const activeTheme = useActiveTheme();
  const theme = themeColors[activeTheme];

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[
          styles.button,
          { borderColor: theme.border, backgroundColor: theme.inactiveBg },
        ]}
        onPress={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        activeOpacity={0.7}
      >
        <Text
          style={[
            styles.buttonText,
            { color: value <= min ? theme.disabledText : theme.text },
          ]}
        >
          −
        </Text>
      </TouchableOpacity>

      {Array.from({ length: max - min + 1 }, (_, i) => i + min).map((n) => {
        const isActive = n === value;
        return (
          <TouchableOpacity
            key={n}
            style={[
              styles.step,
              {
                backgroundColor: isActive ? theme.activeBg : theme.inactiveBg,
                borderColor: isActive ? theme.primary : theme.border,
              },
            ]}
            onPress={() => onChange(n)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.stepText,
                { color: isActive ? theme.activeText : theme.text },
              ]}
            >
              {n}
            </Text>
          </TouchableOpacity>
        );
      })}

      <TouchableOpacity
        style={[
          styles.button,
          { borderColor: theme.border, backgroundColor: theme.inactiveBg },
        ]}
        onPress={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        activeOpacity={0.7}
      >
        <Text
          style={[
            styles.buttonText,
            { color: value >= max ? theme.disabledText : theme.text },
          ]}
        >
          +
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  button: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 20,
  },
  step: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
