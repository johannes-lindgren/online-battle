# Online Battle

![cover-art.png](cover-art.png)

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

## Find my IP

To find your local IP address, you can run the following command in your terminal:

MacOS / Linux:

```bash
ipconfig getifaddr en0
```

Windows:

```bash
ipconfig | findstr /i "IPv4"
```

# Online Battle - TURN Server Setup

This project can use a TURN server to make peer-to-peer connections work behind NAT/firewalls.

## Quick start (Docker)

1. Copy `.env.example` to `.env` and edit values:
   - `TURN_PUBLIC_IP`: your machine's public IP or DNS name (for local dev you can use your LAN IP)
   - `TURN_REALM`, `TURN_USERNAME`, `TURN_PASSWORD`: set custom values
2. Start coturn:

```sh
docker compose up -d
```

This exposes:

- STUN/TURN on 3478 (UDP/TCP)
- TURN relay ports 49152-49252 (UDP)

Ensure your firewall/NAT allows these.

## Using the TURN server in the app

Add the ICE server config when creating a `RTCPeerConnection`:

```ts
const pc = new RTCPeerConnection({
  iceServers: [
    { urls: ['stun:' + TURN_PUBLIC_URL] },
    {
      urls: ['turn:' + TURN_PUBLIC_URL + ':3478'],
      username: TURN_USERNAME,
      credential: TURN_PASSWORD,
    },
  ],
})
```

Where `TURN_PUBLIC_URL` is the host/IP you set for `TURN_PUBLIC_IP`.

For local dev using localhost, Chrome requires secure context for TURN over TCP sometimes; prefer using your LAN IP.

## Troubleshooting

- If candidates are all `host` and no `srflx`/`relay`, verify ports are open and `TURN_PUBLIC_IP` is reachable from peers.
- On macOS Docker Desktop, ensure UDP port range is exposed and not blocked by firewall.
- Check coturn logs in the container:

```sh
docker compose logs -f coturn
```

- Test TURN credentials with `trickle` or WebRTC test pages.
