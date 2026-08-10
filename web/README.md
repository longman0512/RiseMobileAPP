# nfc.officialrise.com

Static host (Vercel) for the deep-link association files behind the NFC coins.
The Shopify storefront on the apex domain is untouched; only this subdomain
serves the well-known files.

Coins are written with one type-only NDEF link:

```
https://nfc.officialrise.com/protocol/lockin
https://nfc.officialrise.com/protocol/flow
https://nfc.officialrise.com/protocol/reset
```

Coin *ownership* is not encoded in the tag — the app verifies it against the
Supabase coin list after the link is handled.

## Files

| File | Platform | Purpose |
|---|---|---|
| `.well-known/apple-app-site-association` | iOS | Universal Link association. Must be served as `application/json`, no redirects, over HTTPS. |
| `.well-known/assetlinks.json` | Android | App Link (Digital Asset Links) verification. |
| `vercel.json` | both | Sets the AASA content type. |

## Android: fill in the fingerprints before deploying

`assetlinks.json` ships with placeholders. Replace them with the SHA-256
certificate fingerprints for `com.risemobile`:

```sh
# Upload key (the keystore you sign the AAB with)
keytool -list -v -keystore <your-release.keystore> -alias <your-alias> | grep SHA256

# Debug builds, if you want App Links verified on dev devices too
keytool -list -v -keystore android/app/debug.keystore \
  -alias androiddebugkey -storepass android -keypass android | grep SHA256
```

If the app is distributed through Google Play, the fingerprint that matters is
the **Play App Signing** one: Play Console → your app → Setup → App integrity →
App signing key certificate → SHA-256. Include both that and the upload key.

Verify after deploying:

```sh
curl -s https://nfc.officialrise.com/.well-known/assetlinks.json
adb shell pm verify-app-links --re-verify com.risemobile
adb shell pm get-app-links com.risemobile      # expect: verified
```

Note that Android coin taps do **not** depend on this file: the app claims the
tag directly with an `NDEF_DISCOVERED` intent filter. `assetlinks.json` only
governs the same URL arriving from a browser, a message, or another app.
