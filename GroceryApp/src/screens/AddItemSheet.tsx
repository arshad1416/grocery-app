/**
 * AddItemSheet — quick-add bottom sheet for grocery items.
 *
 * Provides:
 *  - Quick-add buttons for common items (categorized)
 *  - Custom item input (name + quantity + unit)
 *  - Placeholder slots for voice and barcode scanning (Phase 3)
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

  // Reset form when sheet opens
  const resetForm = useCallback(() => {
    setCustomName('');
    setCustomQty('1');
    setCustomUnit('pcs');
    setActiveTab('produce');
    setAdding(false);
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
          {/* ── Custom Item Input ────────────────────────────────────── */}
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

          {/* ── Quick-Add Section ────────────────────────────────────── */}
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

          {/* ── Voice / Barcode Placeholders (Phase 3) ────────────────── */}
          <View style={styles.futureSection}>
            <TouchableOpacity style={styles.futureBtn} disabled>
              <Text style={styles.futureBtnText}>🎤 Voice Input</Text>
              <Text style={styles.futureBadge}>Phase 3</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.futureBtn} disabled>
              <Text style={styles.futureBtnText}>📷 Barcode Scan</Text>
              <Text style={styles.futureBadge}>Phase 3</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
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
  futureSection: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  futureBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    opacity: 0.6,
  },
  futureBtnText: {
    fontSize: 13,
    color: '#999',
  },
  futureBadge: {
    fontSize: 10,
    color: '#bbb',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
});