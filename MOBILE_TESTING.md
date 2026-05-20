# Mobile testing with Expo Go

Fastest way to test the React Native mobile app on your phone without doing a
TestFlight build. Takes about 5 minutes.

## What you need

- iPhone or Android phone
- Mac with Node.js 20+
- The **Expo Go** app on your phone — [iOS](https://apps.apple.com/app/expo-go/id982107779) / [Android](https://play.google.com/store/apps/details?id=host.exp.exponent)
- Phone and Mac on the same Wi-Fi network

## Setup

```bash
# 1. Clone (if you haven't already)
git clone https://github.com/chcpaint/expensehub-v1.git ~/dev/expensehub-v1
cd ~/dev/expensehub-v1

# 2. Install all workspace deps
npm install

# 3. Configure env for mobile
cd apps/mobile
cp ../../.env.production.example .env
# The .env already has the Supabase URL + anon key — no edits needed for testing

# 4. Start Expo
npx expo start
```

A QR code appears in your terminal.

## Open on your phone

- **iPhone**: open the Camera app → point at the QR → tap the "Open in Expo Go" banner
- **Android**: open Expo Go → "Scan QR code" → point at the QR

The app downloads to Expo Go and opens.

## Sign in

- Email: `adamberube@me.com`
- Password: `Pilot-Test-2026!` (change it after first login)

You should see the **Northridge Construction** branded header at the top of the app.

## What to try

1. **Capture a receipt** — camera opens; snap any receipt (or use the photo library button)
2. **Review the OCR pre-fill** — without real Document AI credentials, the stub returns a deterministic "Starbucks $13.81". With real OCR set up in the Render worker's env vars, you'll see actual extraction
3. **Submit** the expense
4. **My Expenses** — see your submitted expenses with their current status (Pending → Approved → Exported → Reconciled)
5. **Approvals tab** — if you're the approver on your own expense, swipe-to-approve here

## When you're ready for a proper TestFlight build

```bash
cd ~/dev/expensehub-v1/apps/mobile
npm install -g eas-cli
eas login                                 # uses your Expo account
eas build:configure                       # one-time setup
eas build --profile preview --platform ios
```

Builds an `.ipa` you can install on test devices via TestFlight. `eas submit`
publishes to the App Store.

## Notes

- **Realtime OCR pre-fill** uses Supabase Realtime; should be near-instant after submit
- **Push notifications**: not wired in v1 — approvers see their queue in the Approvals tab. Will add via Expo Notifications in v1.1
- **Biometric re-auth** is wired for the Approve button — you'll get Face ID / Touch ID prompt before an approval submits
