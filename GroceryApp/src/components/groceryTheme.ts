/**
 * Shared theme constants for GroceryListScreen and its extracted components.
 */

export const themeColors = {
  light: {
    bg: '#F8FAFC',
    cardBg: '#FFFFFF',
    text: '#0F172A',
    secondaryText: '#64748B',
    border: '#E2E8F0',
    primary: '#10B981',
    headerBg: '#FFFFFF',
    inputBg: '#F1F5F9',
    divider: '#E2E8F0',
    pillUnselectedBg: '#FFFFFF',
    pillUnselectedBorder: '#E2E8F0',
    pillSelectedBg: '#10B981',
    pillCheapestBg: '#DEF7EC',
    pillCheapestBorder: '#10B981',
  },
  dark: {
    bg: '#0B0F19',
    cardBg: '#1E293B',
    text: '#F8FAFC',
    secondaryText: '#94A3B8',
    border: '#334155',
    primary: '#10B981',
    headerBg: '#1E293B',
    inputBg: '#1E293B',
    divider: '#334155',
    pillUnselectedBg: '#1E293B',
    pillUnselectedBorder: '#334155',
    pillSelectedBg: '#10B981',
    pillCheapestBg: '#0B2518',
    pillCheapestBorder: '#10B981',
  },
};

export type ThemeColors = typeof themeColors.light;

export const CATEGORY_COLORS: Record<string, string> = {
  produce: '#4CAF50',
  dairy: '#2196F3',
  meat: '#f44336',
  bakery: '#FF9800',
  frozen: '#00BCD4',
  pantry: '#9C27B0',
  beverages: '#795548',
  other: '#607D8B',
};

export function getCategoryColor(category: string): string {
  if (category.toLowerCase().startsWith('stop ')) {
    return '#10B981';
  }
  return CATEGORY_COLORS[category] ?? '#607D8B';
}
