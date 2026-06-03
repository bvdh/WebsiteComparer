# CompareSites

Compare two versions of a site side-by-side with synchronized scrolling and path-based navigation mirroring.

## Features

- Left/right pane comparison layout.
- Path-based mapping between two base URLs.
- Scroll synchronization in both directions.
- Link-follow synchronization for internal links.
- Shared back/forward navigation history.
- 404 behavior is preserved from each target site.

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Start the proxy server (Terminal A):

```bash
npm run dev:server
```

3. Start the web app (Terminal B):

```bash
npm run dev
```

4. Open the Vite URL shown in Terminal B (usually `http://localhost:5173`).

## Run with Docker

The Docker image builds the frontend and serves both the React app and the proxy API from the same Express process on port `8787`.

1. Build the image:

```bash
docker build -t comparesites .
```

2. Run the container:

```bash
docker run --rm -p 8787:8787 comparesites
```

3. Open:

```text
http://localhost:8787
```

If you want a different port inside the container, pass `-e PORT=<port>` and publish the same port with `-p`.

## Run with Docker Compose

Use Docker Compose when you want a one-command build and run workflow.

Current compose setup in [docker-compose.yml](docker-compose.yml) exposes the app on port `8788`.

1. Build and start in foreground:

```bash
docker compose up --build
```

2. Build and start in background:

```bash
docker compose up --build -d
```

3. Open:

```text
http://localhost:8788
```

4. View logs:

```bash
docker compose logs -f comparesites
```

5. Stop and remove containers/network:

```bash
docker compose down
```

6. Rebuild from scratch when needed:

```bash
docker compose build --no-cache
docker compose up -d
```

## Access from another device

The app now binds to all interfaces. To open it from another device on the same network:

1. Find this machine's LAN IP (example: `192.168.1.42`).
2. Start services:

- `npm run dev:server` (proxy on 8787)
- `npm run dev` (frontend on 5173)

3. Open from another device:

- `http://<LAN_IP>:5173`

4. If it still fails, allow incoming TCP ports in your firewall:

- `5173` (frontend)
- `8787` (proxy API)
- `3001` and `3002` if you serve local comparison sites with `serve:static`

Note: If you need internet/public access (not just LAN), you must also configure router port forwarding or run behind a reverse proxy/tunnel.

## Offline mode (no external URL access)

If your machine cannot reach external sites, serve your two local website directories and compare those localhost URLs.

1. Start local site A:

npm run serve:static -- --dir /absolute/path/to/site-a --port 3001

2. Start local site B:

npm run serve:static -- --dir /absolute/path/to/site-b --port 3002

3. In CompareSites, set:

- Left Base URL: http://localhost:3001
- Right Base URL: http://localhost:3002

4. Keep CompareSites running as usual:

- npm run dev:server
- npm run dev

This avoids any dependency on external network access.

## How it works

- The React app loads both panes from `/api/render`.
- The proxy fetches HTML from each base URL and injects a bridge script.
- The bridge script sends scroll and navigation events to the parent app.
- The parent app maps relative paths to the peer base URL and keeps both panes aligned.

## Notes

- This tool targets pages that can be fetched and rendered through the local proxy.
- Very strict target-page CSP policies may reduce synchronization behavior.
- External domain links are ignored for mirrored navigation.

## URL query parameters

You can deep-link the app state with these query parameters:

- `url1`: left base URL
- `url2`: right base URL
- `path`: logical compared path

Example:

`http://localhost:5173/?url1=http%3A%2F%2Flocalhost%3A3001&url2=http%3A%2F%2Flocalhost%3A3002&path=%2F`
