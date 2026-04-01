# Panivo / VitalView

Active runtime paths:

- `mobile/`: Expo React Native iOS app
- `backend/`: FastAPI + PostgreSQL API

## Local iPhone Testing

1. Start Docker Desktop.
2. Start the backend:

```bash
docker compose up -d db backend
```

3. Start Metro for a physical iPhone:

```bash
cd mobile
npm run ios:device:metro
```

This auto-detects your Mac's LAN IP and exports `DEV_API_URL=http://<your-mac-ip>:8000`.

4. Open [mobile/ios/VitalView.xcworkspace](/Users/aaronwood/Desktop/ai-health-buddy/mobile/ios/VitalView.xcworkspace/contents.xcworkspacedata) in Xcode.
5. Set your signing team and, if needed, a unique bundle identifier.
6. Select your connected iPhone and run the app from Xcode.

## Simulator Testing

```bash
cd mobile
npm run ios
```

## Notes

- Cloud AI is optional for local testing. If Vertex is not configured, the backend falls back to a deterministic local debrief/chat mode.
- Real HealthKit sync now triggers post-sync baseline recalculation so device data behaves more like the demo-seed path.
- For production distribution, you will still need real EAS/App Store setup and a hosted backend.
