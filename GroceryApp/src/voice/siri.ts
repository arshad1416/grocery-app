/**
 * Siri Intent Handler Bridge.
 *
 * Provides:
 *  - registerSiriIntent(handler): Registers an AddToGroceryListIntent handler
 *    via expo-siri-shortcuts or the native config plugin.
 *  - donateInteraction(itemName): Donates a Siri shortcut suggestion after
 *    a user manually adds an item, making it available via "Hey Siri" later.
 *  - isSiriAvailable(): Checks if Siri is available (iOS only).
 *
 * Architecture:
 *  - On iOS, Siri intents are registered via the native module bridge.
 *    The intent handler receives a voice utterance, passes it through
 *    parseVoiceText(), and adds the parsed item to the active Yjs document.
 *  - On Android, this module is a no-op stub — the platform detection
 *    happens at the VoiceService layer.
 */

import { Platform } from 'react-native';
import type { ParsedItem } from './types';
import { parseVoiceText } from './nlp';

// ─── Types ───────────────────────────────────────────────────────────────────

export type SiriIntentHandler = (item: ParsedItem) => Promise<void>;

// ─── Internal State ──────────────────────────────────────────────────────────

let registeredHandler: SiriIntentHandler | null = null;
let handlerReady = false;

// ─── Siri Availability ────────────────────────────────────────────────────────

/**
 * Check whether Siri intents are supported on this device.
 * Returns true only on iOS.
 */
export function isSiriAvailable(): boolean {
  return Platform.OS === 'ios';
}

// ─── Intent Registration ──────────────────────────────────────────────────────

/**
 * Register a handler for the AddToGroceryListIntent.
 *
 * On iOS, this connects the native Siri intent extension to the app's
 * voice processing pipeline. The handler receives a ParsedItem that has
 * already been extracted from the voice utterance via the NLP parser.
 *
 * In production, this would use expo-siri-shortcuts or a custom
 * Expo Config Plugin to register the intent definition. For Phase 2,
 * it sets up the in-memory handler bridge that the native layer
 * calls into.
 *
 * @param handler - Async callback invoked when Siri resolves an intent.
 */
export async function registerSiriIntent(
  handler: SiriIntentHandler,
): Promise<void> {
  if (!isSiriAvailable()) {
    console.warn('[Voice:Siri] Siri not available on this platform');
    return;
  }

  registeredHandler = handler;
  handlerReady = true;

  // In production: call into native Siri intent registration
  //   const SiriShortcuts = require('expo-siri-shortcuts');
  //   await SiriShortcuts.registerShortcut({
  //     intent: 'AddToGroceryListIntent',
  //     handler: (utterance: string) => {
  //       const parsed = parseVoiceText(utterance);
  //       return handler(parsed);
  //     },
  //   });

  console.log('[Voice:Siri] AddToGroceryListIntent handler registered');
}

// ─── Intent Donation ──────────────────────────────────────────────────────────

/**
 * Donate a Siri shortcut interaction after the user manually adds an item.
 *
 * This teaches Siri to suggest "Add [itemName] to grocery list" as a
 * shortcut when the user is likely to need it (e.g., at the grocery store).
 *
 * @param itemName - The name of the item that was added.
 */
export async function donateInteraction(itemName: string): Promise<void> {
  if (!isSiriAvailable()) return;

  // In production:
  //   const SiriShortcuts = require('expo-siri-shortcuts');
  //   await SiriShortcuts.donateInteraction({
  //     intent: 'AddToGroceryListIntent',
  //     parameters: { itemName },
  //   });

  console.log(`[Voice:Siri] Donated interaction for "${itemName}"`);
}

// ─── Intent Dispatch ──────────────────────────────────────────────────────────

/**
 * Handle an incoming Siri intent utterance.
 *
 * This is the entry point called by the native Siri intent extension
 * when a user says something like "Add milk to my grocery list" via Siri.
 *
 * @param utterance - The raw voice text from Siri.
 * @returns The parsed item if the handler processed it successfully.
 */
export async function handleSiriUtterance(
  utterance: string,
): Promise<ParsedItem | null> {
  if (!handlerReady || !registeredHandler) {
    console.warn(
      '[Voice:Siri] No handler registered — ignoring Siri utterance',
    );
    return null;
  }

  const parsed = parseVoiceText(utterance);
  await registeredHandler(parsed);
  return parsed;
}