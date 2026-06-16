/**
 * Shared theme constants for GroceryListScreen and all other screens/components.
 * Antigravity Redesign — neon-green glassmorphism (dark) + warm cream/sage (light).
 */

export const themeColors = {
  light: {
    // Core brand & background colors
    bg: '#FDF8F0',               // Warm cream/off-white
    cardBg: '#FFFFFF',           // Pure white cards
    text: '#1A1A1A',             // Near-black primary text
    secondaryText: '#6B7B6F',    // Sage-gray secondary
    border: 'rgba(0, 0, 0, 0.06)', // Very subtle border
    primary: '#7CB342',          // Sage/olive green
    headerBg: '#FFFFFF',         // White header
    inputBg: '#F5F0E8',          // Warm tinted input
    divider: 'rgba(0, 0, 0, 0.06)',
    accent: '#FF8F00',           // Amber/orange for badges
    danger: '#E53935',           // Red for delete
    warning: '#FF8F00',
    info: '#1E88E5',             // Blue for info

    // Component-specific colors
    btnBg: '#F5F0E8',            // Warm button background
    btnText: '#1A1A1A',          // Dark text for buttons
    segmentedBg: '#F5F0E8',
    segmentActiveBg: '#7CB342',

    tabActiveBg: '#7CB342',
    tabInactiveBg: '#F5F0E8',
    tabActiveText: '#FFFFFF',
    tabInactiveText: '#9CA89E',
    modalOverlay: 'rgba(26, 26, 26, 0.4)',
    voiceBtnBg: '#1E88E5',

    // Stop Optimizer & Pricing
    savingsBg: 'rgba(124, 179, 66, 0.12)',
    savingsText: '#4A7C59',
    bestValueBorder: '#7CB342',
    bestValueBg: 'rgba(124, 179, 66, 0.12)',
    bestValueText: '#4A7C59',

    // Trip Plan Sheet
    overlay: 'rgba(26, 26, 26, 0.4)',
    stopBg: '#F5F0E8',
    subtotalBg: '#E8E3DB',
    unassignedBg: 'rgba(255, 143, 0, 0.1)',
    unassignedBorder: '#FF8F00',
    unassignedText: '#92400E',

    // Stepper
    activeBg: '#7CB342',
    activeText: '#FFFFFF',
    inactiveBg: '#F5F0E8',
    disabledText: '#9CA89E',

    // Permission Modal
    card: '#FFFFFF',
    primaryText: '#FFFFFF',
    noteBg: 'rgba(124, 179, 66, 0.08)',
    noteBorder: 'rgba(124, 179, 66, 0.2)',

    // Pill selectors
    pillUnselectedBg: '#F5F0E8',
    pillUnselectedBorder: 'rgba(0, 0, 0, 0.08)',
    pillSelectedBg: '#7CB342',
    pillCheapestBg: 'rgba(124, 179, 66, 0.12)',
    pillCheapestBorder: '#7CB342',

    // Store cards
    storeCardBg: '#FFFFFF',
    storeCardBorder: 'rgba(0, 0, 0, 0.08)',
    storeCardShadow: { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8 },

    // Bottom nav
    navBg: '#FFFFFF',
    navActive: '#7CB342',
    navInactive: '#9CA89E',
    navBorder: 'rgba(0, 0, 0, 0.06)',

    // Checkbox
    checkBg: '#7CB342',
    checkBorder: '#D2DEC9',
    checkIcon: '#FFFFFF',

    // Quantity buttons
    qtyBtnBg: '#F5F0E8',
    qtyBtnText: '#1A1A1A',
    qtyBtnBorder: 'rgba(0, 0, 0, 0.08)',

    // Category pills
    pillBg: '#F5F0E8',
    pillText: '#6B7B6F',
    pillActiveBg: '#7CB342',
    pillActiveText: '#FFFFFF',

    // Glassmorphism (light mode — no real glass, just white cards)
    glassOpacity: 0,
    blur: 0,

    // Neon glow (not used in light mode, but defined for type compat)
    primaryGlow: 'rgba(124, 179, 66, 0.3)',
    primaryDim: 'rgba(124, 179, 66, 0.12)',
  },
  dark: {
    // Core brand & background colors
    bg: '#0B0F12',               // Deep charcoal/black
    cardBg: 'rgba(255, 255, 255, 0.06)', // Frosted glass cards
    text: '#FFFFFF',             // Pure white primary text
    secondaryText: '#8A9BA8',    // Cool gray secondary
    border: 'rgba(0, 230, 118, 0.15)', // Neon green subtle border
    primary: '#00E676',          // Neon green (main accent)
    headerBg: '#0B0F12',         // Same as bg, seamless
    inputBg: 'rgba(255, 255, 255, 0.08)', // Glass input fields
    divider: 'rgba(255, 255, 255, 0.06)',
    accent: '#FFD740',           // Amber/gold for warnings/badges
    danger: '#FF5252',           // Red for delete
    warning: '#FFD740',
    info: '#448AFF',             // Blue for info

    // Component-specific colors
    btnBg: 'rgba(255, 255, 255, 0.08)',
    btnText: '#FFFFFF',
    segmentedBg: 'rgba(255, 255, 255, 0.06)',
    segmentActiveBg: '#00E676',

    tabActiveBg: '#00E676',
    tabInactiveBg: 'rgba(255, 255, 255, 0.06)',
    tabActiveText: '#0B0F12',
    tabInactiveText: '#5A6B78',
    modalOverlay: 'rgba(0, 0, 0, 0.75)',
    voiceBtnBg: '#448AFF',

    // Stop Optimizer & Pricing
    savingsBg: 'rgba(0, 230, 118, 0.1)',
    savingsText: '#00E676',
    bestValueBorder: '#00E676',
    bestValueBg: 'rgba(0, 230, 118, 0.1)',
    bestValueText: '#00E676',

    // Trip Plan Sheet
    overlay: 'rgba(0, 0, 0, 0.75)',
    stopBg: 'rgba(255, 255, 255, 0.06)',
    subtotalBg: 'rgba(255, 255, 255, 0.04)',
    unassignedBg: 'rgba(255, 215, 64, 0.1)',
    unassignedBorder: '#FFD740',
    unassignedText: '#FFD740',

    // Stepper
    activeBg: '#00E676',
    activeText: '#0B0F12',
    inactiveBg: 'rgba(255, 255, 255, 0.08)',
    disabledText: '#3A4A50',

    // Permission Modal
    card: 'rgba(255, 255, 255, 0.06)',
    primaryText: '#FFFFFF',
    noteBg: 'rgba(0, 230, 118, 0.08)',
    noteBorder: 'rgba(0, 230, 118, 0.2)',

    // Pill selectors
    pillUnselectedBg: 'rgba(255, 255, 255, 0.06)',
    pillUnselectedBorder: 'rgba(0, 230, 118, 0.1)',
    pillSelectedBg: '#00E676',
    pillCheapestBg: 'rgba(0, 230, 118, 0.1)',
    pillCheapestBorder: 'rgba(0, 230, 118, 0.3)',

    // Store cards
    storeCardBg: 'rgba(255, 255, 255, 0.04)',
    storeCardBorder: 'rgba(0, 230, 118, 0.1)',
    storeCardShadow: { shadowColor: '#00E676', shadowOpacity: 0.15, shadowRadius: 12 },

    // Bottom nav
    navBg: 'rgba(11, 15, 18, 0.95)',
    navActive: '#00E676',
    navInactive: '#5A6B78',
    navBorder: 'rgba(255, 255, 255, 0.08)',

    // Checkbox
    checkBg: '#00E676',
    checkBorder: '#5A6B78',
    checkIcon: '#0B0F12',

    // Quantity buttons
    qtyBtnBg: 'rgba(255, 255, 255, 0.08)',
    qtyBtnText: '#FFFFFF',
    qtyBtnBorder: 'rgba(255, 255, 255, 0.12)',

    // Category pills
    pillBg: 'rgba(0, 230, 118, 0.1)',
    pillText: '#00E676',
    pillActiveBg: '#00E676',
    pillActiveText: '#0B0F12',

    // Glassmorphism
    glassOpacity: 0.06,
    blur: 20,

    // Neon glow
    primaryGlow: 'rgba(0, 230, 118, 0.3)',
    primaryDim: 'rgba(0, 230, 118, 0.12)',
  },
};

export type ThemeColors = typeof themeColors.light;

export const CATEGORY_COLORS: Record<string, string> = {
  produce: '#16A34A',    // Leaf green for produce
  dairy: '#2563EB',      // Blue for milk/dairy
  meat: '#DC2626',       // Red for meat
  bakery: '#D97706',     // Amber for bakery
  frozen: '#06B6D4',     // Cyan for frozen
  pantry: '#7C3AED',     // Purple for pantry
  beverages: '#B45309',  // Brown for drinks
  other: '#4B5563',      // Gray for other
};

export function getCategoryColor(category: string): string {
  if (category.toLowerCase().startsWith('stop ')) {
    return '#7CB342';
  }
  return CATEGORY_COLORS[category.toLowerCase()] ?? '#4B5563';
}
