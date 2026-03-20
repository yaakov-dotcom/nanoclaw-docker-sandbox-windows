# Chrome CDP Setup (Docker Sandbox + Windows)

Connect NanoClaw agents to your real Chrome browser on Windows, preserving logins, cookies, and avoiding bot detection.

## Architecture

```
Andy's container (cdp.mjs)
  → host.docker.internal:9222            (172.17.0.1 = sandbox)
    → cdp-proxy.mjs                      (relay in sandbox, port 9222)
      → MITM proxy                       (sandbox built-in, port 3128)
        → host.docker.internal:9222      (Windows host)
          → netsh portproxy              (0.0.0.0:9222 → 127.0.0.1:9222)
            → Chrome                     (localhost:9222)
```

### Why each piece

| Component | Why needed |
|-----------|-----------|
| `cdp-proxy.mjs` | Container can only reach the sandbox (172.17.0.1), not Windows. Routes requests through the MITM proxy which is the only allowed exit path. |
| MITM proxy (port 3128) | Sandbox firewall blocks all direct outbound TCP. `--bypass-host` skips inspection but doesn't open the firewall for raw TCP (socat). |
| `netsh portproxy` | Chrome only listens on `127.0.0.1`. The proxy connects to the Windows host's network interface, so netsh forwards to localhost. |
| Chrome `--remote-debugging-port` | Enables the CDP API. |

Without the Docker sandbox, you'd only need Chrome with the flag — everything else punches through the sandbox's network isolation.

## Setup

### 1. Windows: Chrome with remote debugging

Close all Chrome instances first (check Task Manager), then:

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="$env:USERPROFILE\chrome-andy"
```

Verify at `http://localhost:9222/json/version` — should return JSON.

### 2. Windows: Port forwarding (one-time, as admin)

```powershell
netsh interface portproxy add v4tov4 listenport=9222 listenaddress=0.0.0.0 connectport=9222 connectaddress=127.0.0.1
```

To remove later:
```powershell
netsh interface portproxy delete v4tov4 listenport=9222 listenaddress=0.0.0.0
```

### 3. Host: Sandbox network bypass (one-time)

From WSL/host terminal (outside the sandbox):

```bash
docker sandbox network proxy <sandbox-name> --bypass-host localhost
```

### 4. Sandbox: Start the CDP relay

```bash
node cdp-proxy.mjs &
```

This must be running whenever agents need Chrome access.

### 5. Verify

From inside the sandbox:
```bash
curl -s http://host.docker.internal:9222/json/version
```

Should return Chrome's version JSON with a `webSocketDebuggerUrl`.

## Troubleshooting

### Chrome shows "starting..." and never connects
Chrome was already running in the background. Kill all `chrome.exe` processes in Task Manager, then relaunch with the flags.

### `ECONNREFUSED 192.168.65.x:9222`
netsh portproxy not set up, or Windows Firewall blocking port 9222. Add a firewall rule:
```powershell
netsh advfirewall firewall add rule name="Chrome CDP" dir=in action=allow protocol=TCP localport=9222
```

### `connection blocked by network policy`
Sandbox bypass not configured. Run `docker sandbox network proxy <name> --bypass-host localhost` from the host.

### `Timeout: Target.getTargets`
cdp-proxy.mjs not running. Start it with `node cdp-proxy.mjs &`.

### Empty reply from server
Chrome is rejecting the Host header. Make sure you're going through cdp-proxy.mjs, not connecting directly.
