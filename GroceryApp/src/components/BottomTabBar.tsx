/**
 * BottomTabBar — Custom bottom navigation bar.
 * Dark mode: 5 tabs with glassmorphism effect.
 * Light mode: 5 tabs with white background.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../state/useThemeStore';
import { themeColors } from './groceryTheme';

export type TabName = 'home' | 'lists' | 'scan' | 'deals' | 'account';

interface TabConfig {
  name: TabName;
  label: string;
  icon: string;
  iconFocused: string;
}

const TABS: TabConfig[] = [
  { name: 'home', label: 'Home', icon: 'home-outline', iconFocused: 'home' },
  { name: 'lists', label: 'Lists', icon: 'list-outline', iconFocused: 'list' },
  { name: 'scan', label: 'Scan', icon: 'scan-outline', iconFocused: 'scan' },
  { name: 'deals', label: 'Deals', icon: 'pricetag-outline', iconFocused: 'pricetag' },
  { name: 'account', label: 'Account', icon: 'person-outline', iconFocused: 'person' },
];

interface BottomTabBarProps {
  activeTab: TabName;
  onTabPress: (tab: TabName) => void;
}

export default function BottomTabBar({ activeTab, onTabPress }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const activeTheme = useActiveTheme();
  const isDark = activeTheme === 'dark';
  const theme = isDark ? themeColors.dark : themeColors.light;

  return (
    <View
      style={[
        styles.container,
        {
          paddingBottom: Math.max(insets.bottom, 24),
          backgroundColor: isDark ? 'rgba(11, 15, 18, 0.95)' : '#FFFFFF',
          borderTopColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
        },
      ]}
    >
      {TABS.map((tab) => {
        const isActive = activeTab === tab.name;
        const iconName = isActive ? tab.iconFocused : tab.icon;
        const iconColor = isActive
          ? isDark
            ? '#00E676'
            : '#7CB342'
          : isDark
            ? '#5A6B78'
            : '#9CA89E';

        return (
          <TouchableOpacity
            key={tab.name}
            style={styles.tab}
            onPress={() => onTabPress(tab.name)}
            activeOpacity={0.7}
          >
            <View style={styles.tabContent}>
              {isActive && isDark && (
                <View style={[styles.glowDot, { backgroundColor: 'rgba(0, 230, 118, 0.3)' }]} />
              )}
              <Ionicons name={iconName as any} size={22} color={iconColor} />
              <Text
                style={[
                  styles.tabLabel,
                  {
                    color: iconColor,
                    fontWeight: isActive ? '600' : '400',
                  },
                ]}
              >
                {tab.label}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabContent: {
    alignItems: 'center',
    gap: 2,
  },
  tabLabel: {
    fontSize: 11,
  },
  glowDot: {
    position: 'absolute',
    top: -4,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});
