# StopHop — Store Compliance Reference

> **Generated:** June 15, 2026 | **App version:** v1.03 | **Package:** `com.shiftlogichq.stophop`

This document contains all declarations needed for Google Play Console and Apple App Store Connect submissions.

---

## 1. Google Play — Data Safety Section

Navigate to: **Play Console → StopHop → App Content → Data Safety**

### Data Collection Overview

**Does your app collect or share any of the required user data types?**
→ **Yes**

### Data Types Collected

| Category | Data Type | Collected? | Shared? | Purpose | Optional? |
|----------|-----------|------------|---------|---------|-----------|
| **App activity** | App interactions | Yes | No | App functionality | No |
| **App info and performance** | Crash logs | Yes | Yes (Sentry) | Analytics, app functionality | Yes |
| **Device or other IDs** | Device or other IDs | Yes | No | App functionality | No |

### Detailed Breakdown

#### App Activity → App Interactions
- **Collected:** Yes
- **Shared:** No
- **Purpose:** App functionality
- **Required or Optional:** Required
- **Explanation:** StopHop tracks in-app interactions (item additions, list edits) locally on the device to support the grocery list feature. This data is encrypted and stored only on the user's device.

#### App Info and Performance → Crash Logs
- **Collected:** Yes
- **Shared:** Yes (with Sentry, sentry.io)
- **Purpose:** Analytics, App functionality
- **Required or Optional:** Optional (user can opt out in Settings → Privacy)
- **Explanation:** Anonymous crash reports are sent to Sentry for debugging. Reports contain device model, OS version, app version, and stack traces. No grocery data or personal information is included.

#### Device or Other IDs → Device or Other IDs
- **Collected:** Yes
- **Shared:** No
- **Purpose:** App functionality
- **Required or Optional:** Required
- **Explanation:** A randomly generated device identifier is used for family pairing and multi-device sync. It is not linked to the user's real identity.

### Security Practices

| Practice | Status |
|----------|--------|
| Data is encrypted in transit | ✅ Yes |
| Data is encrypted at rest | ✅ Yes (XChaCha20-Poly1305) |
| Users can request data deletion | ✅ Yes |
| Committed to following the Families Policy | ❌ No (not targeted at children) |
| Follows Google Play Families Policy | ❌ No |

### Data Safety Form Answers (Copy-Paste Ready)

**Does your app collect or share any of the required user data types?**
→ Yes

**Is all of the user data collected by your app encrypted in transit?**
→ Yes

**Do you provide a way for users to request that their data is deleted?**
→ Yes

**URL of your app's privacy policy:**
→ `https://groceryapp.app/privacy`

---

## 2. Apple App Store — App Privacy Labels

Navigate to: **App Store Connect → StopHop → App Privacy**

### Privacy Label Configuration

Click "Edit" next to App Privacy and configure as follows:

#### Data Used to Track You
→ **No** — StopHop does not track users across apps or websites.

#### Data Linked to You
→ **No** — StopHop does not link any collected data to the user's identity.

#### Data Collected

Select **"Yes, we collect data from this app"** and configure:

| Data Category | Data Type | Linked to Identity? | Used for Tracking? | Purpose |
|---------------|-----------|---------------------|---------------------|---------|
| **Crash Data** | Crash Data | No | No | App Functionality, Analytics |
| **Identifiers** | Device ID | No | No | App Functionality |

### Detailed Entries in App Store Connect

#### 1. Crash Data
- **Category:** Crash Data
- **Data Type:** Crash Data
- **Is this data linked to the user's identity?** No
- **Is this data used for tracking?** No
- **Purpose:** App Functionality, Analytics
- **Select all that apply:**
  - ✅ App Functionality
  - ✅ Analytics

#### 2. Identifiers
- **Category:** Identifiers
- **Data Type:** Device ID
- **Is this data linked to the user's identity?** No
- **Is this data used for tracking?** No
- **Purpose:** App Functionality
- **Select all that apply:**
  - ✅ App Functionality

### Privacy Nutrition Label Summary (What Users See)

```
Data Not Linked to You
├── Crash Data
│   └── App Functionality, Analytics
└── Identifiers
    └── App Functionality

Data Used to Track You: None
Data Linked to You:     None
```

### Privacy Policy URL for App Store Connect
→ `https://groceryapp.app/privacy`

---

## 3. Apple Privacy Manifest (NSPrivacyManifest)

Already configured in `app.json` under `expo.ios.privacyManifests`:

```json
{
  "NSPrivacyTracking": false,
  "NSPrivacyTrackingDomains": [],
  "NSPrivacyAccessedAPITypes": [
    {
      "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryFileTimestamp",
      "NSPrivacyAccessedAPITypeReasons": ["C617.1"]
    },
    {
      "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryUserDefaults",
      "NSPrivacyAccessedAPITypeReasons": ["CA92.1"]
    },
    {
      "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategorySystemBootTime",
      "NSPrivacyAccessedAPITypeReasons": ["35F9.1"]
    },
    {
      "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryDiskSpace",
      "NSPrivacyAccessedAPITypeReasons": ["E174.1"]
    }
  ],
  "NSPrivacyCollectedDataTypes": []
}
```

### API Reason Codes Explained

| API | Reason Code | Explanation |
|-----|-------------|-------------|
| File Timestamp (C617.1) | App uses file timestamps for database sync versioning |
| UserDefaults (CA92.1) | App stores user preferences and settings locally |
| System Boot Time (35F9.1) | Used for performance timing and session management |
| Disk Space (E174.1) | Checked before database operations to prevent corruption |

---

## 4. Store Listing — Required Links & Text

### Google Play Store Listing

**Privacy Policy URL:**
```
https://groceryapp.app/privacy
```

**Short Description (80 chars max):**
```
Privacy-first grocery lists. Encrypted, self-hosted family sync. No accounts needed.
```

**Full Description excerpt for privacy:**
```
🔒 PRIVACY-FIRST
• Your data stays on YOUR device — encrypted with military-grade encryption
• No accounts, no sign-ups, no tracking
• Family sync through YOUR self-hosted server (or our managed relay)
• Crash reporting is anonymous and optional
• Open about what we collect: read our privacy policy at groceryapp.app/privacy
```

### Apple App Store Listing

**Privacy Policy URL:**
```
https://groceryapp.app/privacy
```

**Support URL:**
```
https://groceryapp.app
```

---

## 5. Runtime Permission Rationale Strings

### Android (for `shouldShowRequestPermissionRationale`)

#### Camera
**Title:** `Camera Access`
**Message:** `StopHop uses your camera to scan barcodes and add items quickly. No images are captured or saved — frames are processed in real-time and discarded immediately.`

#### Microphone
**Title:** `Microphone Access`
**Message:** `StopHop uses your microphone for voice input. Your speech is converted to text on your device. No audio is recorded or transmitted.`

#### Notifications (Android 13+)
**Title:** `Notification Permission`
**Message:** `StopHop sends local notifications for shopping reminders and family list updates. No remote push notifications — all notifications come from the app on your device.`

### iOS (Info.plist strings — already in app.json)

| Key | Value |
|-----|-------|
| NSCameraUsageDescription | Scan barcodes to add items to your grocery list |
| NSMicrophoneUsageDescription | Add items to your grocery list using voice commands |
| NSSpeechRecognitionUsageDescription | Convert voice commands to grocery list items |

---

## 6. Sentry Configuration for Privacy Compliance

To ensure Sentry respects privacy requirements:

### `sentry-expo` init options (in your Sentry config):

```typescript
Sentry.init({
  dsn: 'YOUR_SENTRY_DSN',
  // Privacy-safe defaults:
  sendDefaultPii: false,           // Don't send PII
  attachStacktrace: true,
  tracesSampleRate: 0,             // No performance tracing (optional)
  beforeSend(event) {
    // Strip any grocery data that might appear in breadcrumbs
    if (event.breadcrumbs) {
      event.breadcrumbs = event.breadcrumbs.filter(
        (b) => !b.message?.includes('item') && !b.message?.includes('list')
      );
    }
    return event;
  },
});
```

### Controlled by the `sentryEnabled` setting:

```typescript
// In your Sentry init:
import { getSettings } from './config/settings';

const settings = getSettings();
if (settings.sentryEnabled === false) {
  // Don't init Sentry, or set transport to noop
  Sentry.init({ dsn: '', enabled: false });
}
```

---

## 7. Managed vs Self-Hosted — What Differs for Compliance

| Aspect | Self-Hosted | Managed |
|--------|-------------|---------|
| **Relay server** | User runs it | ShiftLogic runs it |
| **Data at rest on server** | None (ephemeral relay) | Encrypted blobs only |
| **Privacy policy disclosure** | "You run your own server" | "We relay encrypted data" |
| **Data safety form** | No server-side data | Relay logs (device IDs, timestamps) |
| **GDPR/data deletion** | User controls server | Email request to privacy@ |
| **Price scraping** | Allowed (self-host only) | Not available |
| **Crash reporting** | Same (Sentry) | Same (Sentry) |

For Google Play and Apple, the managed tier is the one that needs compliance disclosure since it involves a third-party server. The self-hosted tier has no server-side data collection by definition.

---

## 8. Checklist: Before Submitting

### Google Play Console
- [ ] Data Safety form filled (see Section 1)
- [ ] Privacy policy URL added: `https://groceryapp.app/privacy`
- [ ] `INTERNET` permission justified
- [ ] `READ_EXTERNAL_STORAGE` maxSdkVersion=32 justified
- [ ] No SYSTEM_ALERT_WINDOW (removed)
- [ ] Target SDK 34+ (Android 14)

### Apple App Store Connect
- [ ] App Privacy labels configured (see Section 2)
- [ ] Privacy policy URL added: `https://groceryapp.app/privacy`
- [ ] Privacy manifest included in build (via app.json)
- [ ] Info.plist usage descriptions present
- [ ] No tracking (NSPrivacyTracking = false)

### In-App
- [ ] Privacy screen accessible from Settings
- [ ] Crash reporting toggle works
- [ ] Price lookup opt-in with disclosure works
- [ ] Permission rationale modal shows before OS dialog
- [ ] Links to privacy policy and ToS work
