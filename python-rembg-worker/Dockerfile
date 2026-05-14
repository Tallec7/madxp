# Worker rembg pour Templates Studio V1.
# Container léger Python 3.11 + rembg + BiRefNet.
# Déployé séparément du central-server (Node) sur Railway.
FROM python:3.11-slim

# Deps système pour onnxruntime + opencv (transitives de rembg).
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 \
        libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps en premier pour profiter du cache Docker.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pré-télécharge le modèle BiRefNet (~170 MB) au build pour éviter le cold
# start lent au 1er render (sinon ~30s d'attente sur le 1er player).
# La fonction `remove()` télécharge le modèle si pas présent dans
# ~/.u2net/. On lui passe une PNG 1px valide pour déclencher le download
# sans casser sur input invalide.
RUN python -c "from rembg import new_session; new_session()"

COPY main.py .

# Pas de healthcheck HTTP — c'est un worker, pas un serveur. Le monitoring
# vient des logs Winston (côté central-server) qui voit les rows
# `cutout_status='ready'` arriver. Si le worker meurt, alerting alimenté
# par le SQL "rows pending depuis >30min".
CMD ["python", "-u", "main.py"]
