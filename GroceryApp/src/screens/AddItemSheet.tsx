/**
 * AddItemSheet — quick-add bottom sheet for grocery items.
 *
 * Provides:
 *  - Quick-add buttons for common items (categorized)
 *  - Custom item input (name + quantity + unit)
 *  - Voice input: on iOS uses Alert.prompt, on Android uses a text modal
 *  - Parsed voice text pre-fills the name/quantity/unit fields
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { BUILT_IN_CATEGORIES } from '../types';
import { useGroceryStore } from '../state/useGroceryStore';
import { useFamilyStore } from '../state/useFamilyStore';
import { parseVoiceText } from '../voice/nlp';
import type { ParsedItem } from '../voice/types';

// ─── Props ──────────────────────────────────────────────────────────────────

interface AddItemSheetProps {
  visible: boolean;
  listId: string;
  onClose: () => void;
  onItemAdded?: () => void;
}

// ─── Common Quick-Add Items ──────────────────────────────────────────────────

interface QuickItem {
  name: string;
  category: string;
  unit: string;
  quantity: number;
}

const QUICK_ITEMS: Record<string, QuickItem[]> = {
  produce: [
    { name: 'Apples', category: 'produce', unit: 'pcs', quantity: 6 },
    { name: 'Bananas', category: 'produce', unit: 'bunch', quantity: 1 },
    { name: 'Lettuce', category: 'produce', unit: 'pcs', quantity: 1 },
    { name: 'Tomatoes', category: 'produce', unit: 'pcs', quantity: 4 },
    { name: 'Carrots', category: 'produce', unit: 'bag', quantity: 1 },
    { name: 'Potatoes', category: 'produce', unit: 'lb', quantity: 5 },
    { name: 'Onions', category: 'produce', unit: 'pcs', quantity: 3 },
    { name: 'Avocados', category: 'produce', unit: 'pcs', quantity: 2 },
  ],
  dairy: [
    { name: 'Milk', category: 'dairy', unit: 'L', quantity: 1 },
    { name: 'Eggs', category: 'dairy', unit: 'pcs', quantity: 12 },
    { name: 'Butter', category: 'dairy', unit: 'lb', quantity: 1 },
    { name: 'Cheese', category: 'dairy', unit: 'oz', quantity: 8 },
    { name: 'Yogurt', category: 'dairy', unit: 'pcs', quantity: 4 },
    { name: 'Cream', category: 'dairy', unit: 'ml', quantity: 250 },
  ],
  meat: [
    { name: 'Chicken Breast', category: 'meat', unit: 'lb', quantity: 2 },
    { name: 'Ground Beef', category: 'meat', unit: 'lb', quantity: 1 },
    { name: 'Bacon', category: 'meat', unit: 'oz', quantity: 12 },
    { name: 'Salmon', category: 'meat', unit: 'lb', quantity: 1 },
    { name: 'Ground Turkey', category: 'meat', unit: 'lb', quantity: 1 },
  ],
  bakery: [
    { name: 'Bread', category: 'bakery', unit: 'pcs', quantity: 1 },
    { name: 'Bagels', category: 'bakery', unit: 'pcs', quantity: 4 },
    { name: 'Croissants', category: 'bakery', unit: 'pcs', quantity: 2 },
    { name: 'Tortillas', category: 'bakery', unit: 'pcs', quantity: 8 },
  ],
  frozen: [
    { name: 'Frozen Pizza', category: 'frozen', unit: 'pcs', quantity: 1 },
    { name: 'Ice Cream', category: 'frozen', unit: 'pcs', quantity: 1 },
    { name: 'Frozen Veggies', category: 'frozen', unit: 'bag', quantity: 2 },
    { name: 'Frozen Fruit', category: 'frozen', unit: 'bag', quantity: 1 },
  ],
  pantry: [
    { name: 'Rice', category: 'pantry', unit: 'lb', quantity: 2 },
    { name: 'Pasta', category: 'pantry', unit: 'oz', quantity: 16 },
    { name: 'Olive Oil', category: 'pantry', unit: 'ml', quantity: 500 },
    { name: 'Salt', category: 'pantry', unit: 'oz', quantity: 16 },
    { name: 'Pepper', category: 'pantry', unit: 'oz', quantity: 4 },
    { name: 'Flour', category: 'pantry', unit: 'lb', quantity: 5 },
    { name: 'Sugar', category: 'pantry', unit: 'lb', quantity: 2 },
  ],
  beverages: [
    { name: 'Water', category: 'beverages', unit: 'L', quantity: 6 },
    { name: 'Orange Juice', category: 'beverages', unit: 'L', quantity: 1 },
    { name: 'Coffee', category: 'beverages', unit: 'oz', quantity: 12 },
    { name: 'Tea', category: 'beverages', unit: 'pcs', quantity: 20 },
  ],
  other: [
    { name: 'Paper Towels', category: 'other', unit: 'pcs', quantity: 1 },
    { name: 'Dish Soap', category: 'other', unit: 'pcs', quantity: 1 },
    { name: 'Trash Bags', category: 'other', unit: 'pcs', quantity: 1 },
  ],
};

// ─── Category Tabs ──────────────────────────────────────────────────────────

const CATEGORY_TABS = [...BUILT_IN_CATEGORIES];

// ─── Main Component ─────────────────────────────────────────────────────────

export default function AddItemSheet({
  visible,
  listId,
  onClose,
  onItemAdded,
}: AddItemSheetProps) {
  // Store
  const addItem = useGroceryStore((s) => s.addItem);
  const items = useGroceryStore((s) => s.items);
  const activeMemberId = useFamilyStore((s) => s.activeMemberId);
  const familyMembers = useFamilyStore((s) => s.members);

  // Local state
  const [activeTab, setActiveTab] = useState('produce');
  const [customName, setCustomName] = useState('');
  const [customQty, setCustomQty] = useState('1');
  const [customUnit, setCustomUnit] = useState('pcs');
  const [adding, setAdding] = useState(false);

  // Voice input state
  const [voiceModalVisible, setVoiceModalVisible] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const [voiceParsed, setVoiceParsed] = useState<ParsedItem | null>(null);
  const [voiceProcessing, setVoiceProcessing] = useState(false);

  // Reset form when sheet opens
  const resetForm = useCallback(() => {
    setCustomName('');
    setCustomQty('1');
    setCustomUnit('pcs');
    setActiveTab('produce');
    setAdding(false);
    setVoiceText('');
    setVoiceParsed(null);
    setVoiceModalVisible(false);
    setVoiceProcessing(false);
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [onClose, resetForm]);

  // Add an item
  const handleAddItem = useCallback(
    async (name: string, category: string, unit: string, quantity: number) => {
      setAdding(true);
      try {
        // Find familyId from first existing item or member
        const listItems = Object.values(items).filter(
          (i) => i.listId === listId,
        );
        const familyId =
          listItems.length > 0
            ? listItems[0].familyId
            : Object.values(familyMembers).length > 0
              ? Object.values(familyMembers)[0].familyId
              : '';

        const maxSort =
          listItems.length > 0
            ? Math.max(...listItems.map((i) => i.sortOrder))
            : 0;

        await addItem({
          listId,
          familyId,
          name,
          quantity,
          unit,
          category,
          isChecked: false,
          addedBy: activeMemberId ?? 'unknown',
          sortOrder: maxSort + 1,
        });

        resetForm();
        onItemAdded?.();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to add item';
        Alert.alert('Error', message);
      } finally {
        setAdding(false);
      }
    },
    [addItem, items, listId, activeMemberId, familyMembers, resetForm, onItemAdded],
  );

  // Handle custom item add
  const handleAddCustom = useCallback(() => {
    if (!customName.trim()) return;
    const qty = parseInt(customQty, 10) || 1;
    handleAddItem(customName.trim(), activeTab, customUnit, qty);
  }, [customName, customQty, activeTab, customUnit, handleAddItem]);

  // ── Voice Input Handlers ───────────────────────────────────────────────

  /**
   * Open voice input — platform-appropriate method.
   * On iOS: uses Alert.prompt (native dictation via keyboard).
   * On Android: shows a text input modal for pasting voice text.
   */
  const openVoiceInput = useCallback(() => {
    if (Platform.OS === 'ios') {
      // iOS: use Alert.prompt with dictation-supporting text field
      Alert.prompt(
        'Voice Input',
        'Tap the microphone on your keyboard and speak, or type what you want to add.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Parse',
            onPress: (text?: string) => {
              if (text && text.trim()) {
                processVoiceText(text.trim());
              }
            },
          },
        ],
        'plain-text',
        '',
        'default',
      );
    } else {
      // Android: show inline voice text modal
      setVoiceText('');
      setVoiceParsed(null);
      setVoiceModalVisible(true);
    }
  }, []);

  /**
   * Process raw voice text through the NLP parser and pre-fill the form.
   */
  const processVoiceText = useCallback(
    (rawText: string) => {
      setVoiceProcessing(true);
      try {
        const parsed = parseVoiceText(rawText);
        setVoiceParsed(parsed);

        if (parsed.name) {
          setCustomName(parsed.name);
          setCustomQty(String(parsed.quantity));
          setCustomUnit(parsed.unit);
        }

        // Auto-dismiss voice modals
        setVoiceModalVisible(false);
      } catch (err) {
        Alert.alert(
          'Could not parse',
          'Please try typing the item name directly.',
        );
      } finally {
        setVoiceProcessing(false);
      }
    },
    [],
  );

  /**
   * Confirm voice-parsed item from Android modal.
   */
  const handleVoiceParse = useCallback(() => {
    if (voiceText.trim()) {
      processVoiceText(voiceText.trim());
    }
  }, [voiceText, processVoiceText]);

  /**
   * Dismiss voice modal.
   */
  const handleVoiceDismiss = useCallback(() => {
    setVoiceModalVisible(false);
    setVoiceText('');
    setVoiceParsed(null);
  }, []);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Add Item</Text>
          <TouchableOpacity onPress={handleClose} disabled={adding}>
            <Text style={styles.closeText}>Done</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Custom Item Input ─────────────────────────────────────── */}
          <View style={styles.customSection}>
            <Text style={styles.sectionLabel}>Custom Item</Text>
            <View style={styles.customRow}>
              <TextInput
                style={styles.customNameInput}
                value={customName}
                onChangeText={setCustomName}
                placeholder="Type item name..."
                placeholderTextColor="#bbb"
                autoCapitalize="sentences"
                autoFocus
              />
              <TextInput
                style={styles.customQtyInput}
                value={customQty}
                onChangeText={setCustomQty}
                keyboardType="numeric"
                placeholder="Qty"
                placeholderTextColor="#bbb"
              />
            </View>
            <View style={styles.customActions}>
              <TextInput
                style={styles.customUnitInput}
                value={customUnit}
                onChangeText={setCustomUnit}
                placeholder="Unit"
                placeholderTextColor="#bbb"
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={[
                  styles.addBtn,
                  (!customName.trim() || adding) && styles.addBtnDisabled,
                ]}
                onPress={handleAddCustom}
                disabled={!customName.trim() || adding}
              >
                {adding ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.addBtnText}>Add</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Quick-Add Section ─────────────────────────────────────── */}
          <Text style={styles.sectionLabel}>Quick Add</Text>

          {/* Category tabs */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tabScroll}
            contentContainerStyle={styles.tabContent}
          >
            {CATEGORY_TABS.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.tab,
                  activeTab === cat && styles.tabActive,
                ]}
                onPress={() => setActiveTab(cat)}
              >
                <Text
                  style={[
                    styles.tabText,
                    activeTab === cat && styles.tabTextActive,
                  ]}
                >
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Quick items grid */}
          <View style={styles.quickGrid}>
            {(QUICK_ITEMS[activeTab] ?? []).map((quick) => (
              <TouchableOpacity
                key={quick.name}
                style={styles.quickChip}
                onPress={() =>
                  handleAddItem(
                    quick.name,
                    quick.category,
                    quick.unit,
                    quick.quantity,
                  )
                }
                disabled={adding}
              >
                <Text style={styles.quickName}>{quick.name}</Text>
                <Text style={styles.quickMeta}>
                  {quick.quantity} {quick.unit}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Voice Input Section ───────────────────────────────────── */}
          <View style={styles.voiceSection}>
            <TouchableOpacity
              style={styles.voiceBtn}
              onPress={openVoiceInput}
              disabled={adding || voiceProcessing}
              activeOpacity={0.7}
            >
              {voiceProcessing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.voiceBtnText}>🎤 Voice Input</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.voiceBtnDisabled}>
              <Text style={styles.voiceBtnText}>📷 Barcode Scan</Text>
              <Text style={styles.voiceBadge}>Phase 3</Text>
            </TouchableOpacity>
          </View>

          {/* Voice parse result indicator */}
          {voiceParsed && (
            <View style={styles.voiceResult}>
              <Text style={styles.voiceResultText}>
                Voice: {voiceParsed.name} ({voiceParsed.quantity} {voiceParsed.unit})
              </Text>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>

        {/* ── Android Voice Text Input Modal ─────────────────────────── */}
        <Modal
          visible={voiceModalVisible}
          animationType="fade"
          transparent
          onRequestClose={handleVoiceDismiss}
        >
          <View style={styles.voiceOverlay}>
            <View style={styles.voiceDialog}>
              <Text style={styles.voiceDialogTitle}>Voice Input</Text>
              <Text style={styles.voiceDialogHint}>
                Type or paste what you want to add, or use your keyboard's
                microphone for dictation.
              </Text>
              <TextInput
                style={styles.voiceDialogInput}
                value={voiceText}
                onChangeText={setVoiceText}
                placeholder='e.g. "2% milk x2" or "half a kilo of chicken"'
                placeholderTextColor="#bbb"
                autoCapitalize="sentences"
                autoFocus
                multiline
              />
              <View style={styles.voiceDialogActions}>
                <TouchableOpacity
                  style={styles.voiceDialogCancel}
                  onPress={handleVoiceDismiss}
                >
                  <Text style={styles.voiceDialogCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.voiceDialogParse,
                    !voiceText.trim() && styles.voiceDialogParseDisabled,
                  ]}
                  onPress={handleVoiceParse}
                  disabled={!voiceText.trim()}
                >
                  <Text style={styles.voiceDialogParseText}>Parse</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
  },
  closeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4CAF50',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 12,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 8,
  },
  customSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  customRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  customNameInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    color: '#333',
    backgroundColor: '#fafafa',
  },
  customQtyInput: {
    width: 60,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    textAlign: 'center',
    color: '#333',
    backgroundColor: '#fafafa',
  },
  customActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  customUnitInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: '#333',
    backgroundColor: '#fafafa',
  },
  addBtn: {
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  addBtnDisabled: {
    opacity: 0.5,
  },
  addBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  tabScroll: {
    marginBottom: 8,
  },
  tabContent: {
    gap: 6,
    paddingVertical: 4,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  tabActive: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  tabText: {
    fontSize: 13,
    color: '#555',
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  quickChip: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#eee',
    minWidth: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  quickName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  quickMeta: {
    fontSize: 11,
    color: '#999',
  },
  // ── Voice Input Styles ────────────────────────────────────────────────
  voiceSection: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  voiceBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#4A90D9',
    borderRadius: 10,
    padding: 14,
    gap: 6,
  },
  voiceBtnDisabled: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    opacity: 0.6,
  },
  voiceBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  voiceBadge: {
    fontSize: 10,
    color: '#bbb',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  voiceResult: {
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
  },
  voiceResultText: {
    fontSize: 13,
    color: '#2E7D32',
    fontWeight: '500',
  },
  // ── Voice Modal (Android) ─────────────────────────────────────────────
  voiceOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  voiceDialog: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  voiceDialogTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
  },
  voiceDialogHint: {
    fontSize: 13,
    color: '#777',
    marginBottom: 12,
    lineHeight: 18,
  },
  voiceDialogInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: '#333',
    backgroundColor: '#fafafa',
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  voiceDialogActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  voiceDialogCancel: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  voiceDialogCancelText: {
    fontSize: 14,
    color: '#555',
    fontWeight: '600',
  },
  voiceDialogParse: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 8,
    backgroundColor: '#4A90D9',
  },
  voiceDialogParseDisabled: {
    opacity: 0.5,
  },
  voiceDialogParseText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },
});