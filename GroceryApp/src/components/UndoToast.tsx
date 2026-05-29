/**
 * UndoToast — Slide-up toast with Undo button and auto-dismiss.
 *
 * Props:
 *  - message: display text (e.g. "Milk ✓ checked off")
 *  - onUndo: called when user taps Undo
 *  - duration: auto-dismiss timeout in ms (default 5000)
 *  - onDismiss: called when toast disappears (auto or manual)
 */

import React, { useEffect, useRef, useCallback } from 'react';
import {
  Animated,
  Text,
  TouchableOpacity,
  StyleSheet,
  View,
  PanResponder,
} from 'react-native';

interface UndoToastProps {
  message: string;
  onUndo: () => void;
  duration?: number;
  onDismiss: () => void;
}

export default function UndoToast({
  message,
  onUndo,
  duration = 5000,
  onDismiss,
}: UndoToastProps) {
  const slideAnim = useRef(new Animated.Value(100)).current; // off-screen bottom
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panY = useRef(new Animated.Value(0)).current;

  // Slide in on mount
  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 15,
        stiffness: 200,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto-dismiss timer
    dismissTimer.current = setTimeout(() => {
      dismiss();
    }, duration);

    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismiss = useCallback(() => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 100,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onDismiss();
    });
  }, [slideAnim, opacityAnim, onDismiss]);

  const handleUndo = useCallback(() => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    onUndo();
    // Animate out immediately
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 100,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onDismiss();
    });
  }, [slideAnim, opacityAnim, onUndo, onDismiss]);

  // Swipe to dismiss
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gesture) => {
        if (gesture.dy < 0) {
          panY.setValue(gesture.dy);
        }
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy < -40) {
          dismiss();
        } else {
          Animated.spring(panY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    }),
  ).current;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [
            { translateY: slideAnim },
            { translateY: panY },
          ],
          opacity: opacityAnim,
        },
      ]}
      {...panResponder.panHandlers}
    >
      <TouchableOpacity
        style={styles.toastTouchable}
        onPress={dismiss}
        activeOpacity={0.9}
      >
        <Text style={styles.message} numberOfLines={1}>
          {message}
        </Text>
        <TouchableOpacity
          style={styles.undoButton}
          onPress={handleUndo}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.undoText}>Undo</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 90, // above FAB
    left: 16,
    right: 16,
    zIndex: 1000,
    elevation: 10,
  },
  toastTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#323232',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  message: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    marginRight: 12,
  },
  undoButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  undoText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
});
