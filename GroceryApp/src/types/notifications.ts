/**
 * Notification types for the family notification system.
 *
 * These types define the notification payload (encrypted end-to-end before
 * transmission) and the local storage record (persisted in WatermelonDB).
 */

/** Notification event types the system can emit */
export type NotificationEventType =
  | 'item_added'
  | 'item_checked'
  | 'item_unchecked'
  | 'item_deleted';

/** The notification payload — encrypted end-to-end before sending over the wire */
export interface NotificationPayload {
  /** Unique notification ID (UUID) */
  id: string;
  /** Event type */
  eventType: NotificationEventType;
  /** Timestamp (ms since epoch) */
  timestamp: number;
  /** Device ID of the sender (who performed the action) */
  senderDeviceId: string;
  /** List ID the item belongs to */
  listId: string;
  /** List name (encrypted — decrypted on receipt for display) */
  listName: string;
  /** Item ID */
  itemId: string;
  /** Item name (encrypted — decrypted on receipt for display) */
  itemName: string;
  /** Item category (for grouping/display) */
  itemCategory: string;
}

/** A stored notification record (persisted locally for badge count + history) */
export interface NotificationRecord {
  id: string;
  eventType: NotificationEventType;
  timestamp: number;
  senderDeviceId: string;
  listId: string;
  listName: string;
  itemId: string;
  itemName: string;
  itemCategory: string;
  /** Whether the user has seen/dismissed this notification */
  isRead: boolean;
}
