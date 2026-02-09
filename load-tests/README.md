# Load Tests - Neopro

Tests de charge pour valider le scaling du Central Server (50+ → 200+ Pi).

## Installation

```bash
# macOS
brew install k6

# Linux
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D68
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6
```

## Utilisation

```bash
# Smoke test (validation rapide)
k6 run scenarios/smoke.js

# Test de charge soutenue
k6 run scenarios/load.js

# Test de stress (trouver les limites)
k6 run scenarios/stress.js

# Avec variables d'environnement custom
k6 run -e BASE_URL=https://api.neopro.fr -e AUTH_EMAIL=admin@test.com scenarios/load.js
```

## Scenarios

| Scenario | VUs | Duration | Objectif |
|----------|-----|----------|----------|
| **smoke** | 1-5 | 1 min | Validation fonctionnelle basique |
| **load** | 10-50 | 5 min | Charge normale (50 Pi + 10 dashboards) |
| **stress** | 50-200 | 10 min | Trouver le point de rupture |

## Seuils de performance

- `http_req_duration` p(95) < 500ms (API standard)
- `http_req_duration` p(95) < 2000ms (uploads, rapports)
- `http_req_failed` < 1%
- Rate limiting : respect des limites configurees

## Rate Limits (reference)

| Limiter | Limite | Fenetre |
|---------|--------|---------|
| auth | 60/min | 1 min |
| api | 100/min | 1 min |
| sensitive | 30/min | 1 min |
| admin | 400/min | 1 min |
| monitoring | 300/min | 1 min |
| upload | 10/h | 1 heure |
| remote | 60/min | 1 min |
