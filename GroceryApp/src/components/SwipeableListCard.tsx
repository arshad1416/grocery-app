/**
 * SwipeableListCard — List card with swipe-to-delete (iOS Mail style).
 *
 * Uses React Native's PanResponder + Animated API for smooth 60fps
 * swipe animations without additional dependencies.
 *
 * - Swiping left reveals a red "Delete" action panel.
 * - Releasing past threshold (80px) triggers onDelete callback.
 * - Releasing before threshold springs back to rest position.
 * - Long-press (≥500ms) triggers onLongPress callback.
 *
 * Fixes applied:
 * - Stale closure: callbacks stored in refs, updated via useEffect (Bug 3)
 * - Timer cleanup on unmount (Bug 6)
 * - PanResponder uses ref-based callbacks to avoid stale captures
 */

import React, { useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  PanResponder,
  StyleSheet,
  GestureResponderEvent,
  PanResponderGestureState,
} from 'react-native';
import type { GroceryList } from '../types';

// ─── Props ──────────────────────────────────────────────────────────────────

export interface SwipeableListCardProps {
  list: GroceryList;
  onPress: () => void;
  onDelete: () => void;
  onShare: () => void;
  onLongPress: (event: GestureResponderEvent) => void;
  theme: {
    cardBg: string;
    text: string;
    secondaryText: string;
    primary: string;
  };
  /** Button label shown on the swipe reveal panel */
  deleteLabel?: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const SWIPE_THRESHOLD = 80;
const DELETE_PANEL_WIDTH = 130;
const LONG_PRESS_MS = 500;

// ─── Component ──────────────────────────────────────────────────────────────

export default function SwipeableListCard({
  list,
  onPress,
  onDelete,
  onShare,
  onLongPress,
  theme,
  deleteLabel = 'Delete',
}: SwipeableListCardProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSwiping = useRef(false);
  const isLongPress = useRef(false);

  // ── Refs for callbacks to avoid stale closures in PanResponder (Bug 3) ──
  const onDeleteRef = useRef(onDelete);
  const onPressRef = useRef(onPress);
  const onLongPressRef = useRef(onLongPress);

  useEffect(() => { onDeleteRef.current = onDelete; }, [onDelete]);
  useEffect(() => { onPressRef.current = onPress; }, [onPress]);
  useEffect(() => { onLongPressRef.current = onLongPress; }, [onLongPress]);

  // ── Cleanup longPressTimer on unmount (Bug 6) ──
  useEffect(() => {
    return () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    };
  }, []);

  // Reset card to rest position
  const resetPosition = useCallback(() => {
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      tension: 200,
      friction: 20,
    }).start();
  }, [translateX]);

  // PanResponder for horizontal swipe — uses refs to avoid stale closures
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (
        _: GestureResponderEvent,
        gesture: PanResponderGestureState,
      ) => {
        // Only capture horizontal swipes (dx > dy and dx is significant)
        return Math.abs(gesture.dx) > Math.abs(gesture.dy) && Math.abs(gesture.dx) > 10;
      },
      onPanResponderGrant: () => {
        isSwiping.current = false;
        // Clear long-press timer when swipe starts
        if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }
      },
      onPanResponderMove: (
        _: GestureResponderEvent,
        gesture: PanResponderGestureState,
      ) => {
        if (gesture.dx < 0) {
          // Only allow left swipe
          isSwiping.current = true;
          const value = Math.max(gesture.dx, -DELETE_PANEL_WIDTH - 20);
          translateX.setValue(value);
        }
      },
      onPanResponderRelease: (
        _: GestureResponderEvent,
        gesture: PanResponderGestureState,
      ) => {
        if (gesture.dx < -SWIPE_THRESHOLD) {
          // Past threshold — reveal delete, then trigger onDelete via ref
          Animated.spring(translateX, {
            toValue: -DELETE_PANEL_WIDTH,
            useNativeDriver: true,
            tension: 200,
            friction: 20,
          }).start();
          // Small delay so user sees the red panel before modal appears
          setTimeout(() => {
            onDeleteRef.current();
            // Reset after a brief delay (modal will cover anyway)
            setTimeout(() => {
              Animated.spring(translateX, {
                toValue: 0,
                useNativeDriver: true,
                tension: 200,
                friction: 20,
              }).start();
            }, 300);
          }, 150);
        } else {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            tension: 200,
            friction: 20,
          }).start();
        }
        isSwiping.current = false;
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          tension: 200,
          friction: 20,
        }).start();
        isSwiping.current = false;
      },
    }),
  ).current;

  // Long-press handlers — use refs to avoid stale closures
  const handlePressIn = useCallback(
    (event: GestureResponderEvent) => {
      isLongPress.current = false;
      longPressTimer.current = setTimeout(() => {
        isLongPress.current = true;
        onLongPressRef.current(event);
      }, LONG_PRESS_MS);
    },
    [],
  );

  const handlePressOut = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handlePress = useCallback(() => {
    // Only fire tap if it wasn't a long-press or swipe
    if (!isLongPress.current && !isSwiping.current) {
      onPressRef.current();
    }
    isLongPress.current = false;
  }, []);

  return (
    <View style={styles.swipeContainer}>
      {/* Delete action panel (behind the card) */}
      <View style={[styles.deletePanel, { width: DELETE_PANEL_WIDTH }]}>
        <TouchableOpacity
          style={styles.deletePanelTouchable}
          onPress={() => {
            onDeleteRef.current();
            resetPosition();
          }}
          activeOpacity={0.7}
        >
          <Text style={styles.deletePanelText}>{deleteLabel}</Text>
        </TouchableOpacity>
      </View>

      {/* Card content (slides left to reveal delete) */}
      <Animated.View
        style={[
          styles.card,
          {
            backgroundColor: theme.cardBg,
            transform: [{ translateX }],
          },
        ]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity
          style={styles.cardTouchable}
          onPress={handlePress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          activeOpacity={0.8}
        >
          <View style={styles.cardInfo}>
            <Text style={[styles.cardName, { color: theme.text }]}>{list.name}</Text>
            {list.description ? (
              <Text style={[styles.cardDesc, { color: theme.secondaryText }]} numberOfLines={1}>
                {list.description}
              </Text>
            ) : null}
            {list.storePreference ? (
              <Text style={[styles.cardStore, { color: theme.secondaryText }]}>
                🏪 {list.storePreference}
              </Text>
            ) : null}
          </View>
          <View style={styles.cardActions}>
            <TouchableOpacity
              style={[styles.shareBtn, { backgroundColor: theme.primary }]}
              onPress={onShare}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.shareBtnText}>Share</Text>
            </TouchableOpacity>
            <Text style={[styles.cardArrow, { color: theme.secondaryText }]}>›</Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  swipeContainer: {
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
  },
  deletePanel: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
  },
  deletePanelTouchable: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  deletePanelText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  card: {
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  cardInfo: {
    flex: 1,
  },
  cardName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  cardDesc: {
    fontSize: 13,
  },
  cardStore: {
    fontSize: 12,
    marginTop: 2,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  shareBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  shareBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  cardArrow: {
    fontSize: 22,
    marginLeft: 8,
  },
});
