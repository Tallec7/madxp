"""
Templates Studio V1 — Worker rembg (S4-C).

Container Python séparé déployé sur Railway. Poll la table `players` (DB
partagée avec central-server) toutes les `POLL_INTERVAL_SECONDS`, claim un
player en `cutout_status='pending'` via SELECT FOR UPDATE SKIP LOCKED,
télécharge `photo_raw_url`, produit un PNG détouré via `rembg` (BiRefNet),
upload sur FTP Hostinger sous `players/{site_id}/{player_id}-cutout.png`,
puis bumpe `cutout_status='ready'` + `photo_cutout_url`.

Spec : studio-template/templates-remotion/spec/STUDIO_V1.md §6 (semaine 4).
Pattern aligné sur le worker render Node (`studio-render-worker.service.ts`)
pour cohérence : claim atomic, fail-stale recovery au boot, drain par tick.

Variables d'env requises :
  DATABASE_URL          → même Railway PG que central-server
  FTP_HOST              → 72.60.93.193 (cf central-server/src/config/ftp-storage.ts)
  FTP_USER              → u406531085.videos
  FTP_PASS              → secret Railway

Variables optionnelles :
  FTP_BASE_DIR          → /neopro-video (défaut)
  FTP_PUBLIC_URL        → https://kalonpartners.bzh/neopro-video (défaut)
  POLL_INTERVAL_SECONDS → 5 (défaut)
  STALE_RECOVERY_MIN    → 10 (défaut)
"""

from __future__ import annotations

import logging
import os
import sys
import time
from ftplib import FTP
from io import BytesIO

import psycopg2
import requests
from rembg import remove


# ── Config (lue à l'import — Railway env stable au boot) ─────────────────────
POLL_INTERVAL_SECONDS = int(os.environ.get("POLL_INTERVAL_SECONDS", "5"))
STALE_RECOVERY_MIN = int(os.environ.get("STALE_RECOVERY_MIN", "10"))
FTP_BASE_DIR = os.environ.get("FTP_BASE_DIR", "/neopro-video").rstrip("/")
FTP_PUBLIC_URL = os.environ.get(
    "FTP_PUBLIC_URL", "https://kalonpartners.bzh/neopro-video"
).rstrip("/")
DOWNLOAD_TIMEOUT = 60
FTP_TIMEOUT = 60

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger("rembg-worker")


def _db():
    """Nouvelle connexion à chaque requête — pool simple, pas de réutilisation
    longue. Le worker traite 1-10 players/heure, le coût d'ouverture est
    négligeable comparé au temps de rembg (10-30s/photo)."""
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL not set")
    return psycopg2.connect(url, sslmode="require" if "railway" in url else "prefer")


def _ftp_login() -> FTP:
    host = os.environ.get("FTP_HOST")
    user = os.environ.get("FTP_USER")
    pwd = os.environ.get("FTP_PASS")
    if not (host and user and pwd):
        raise RuntimeError("FTP_HOST / FTP_USER / FTP_PASS not set")
    ftp = FTP(host, timeout=FTP_TIMEOUT)
    ftp.login(user, pwd)
    return ftp


def fail_stale_processing(max_minutes: int) -> int:
    """Anti-orphan : remet en 'pending' les rows 'processing' claimées par un
    process mort. Sans ça, un crash du worker bloque ces rows ad vitam.
    Pattern aligné sur `failStaleRunning(10)` du worker render Node."""
    with _db() as conn, conn.cursor() as cur:
        cur.execute(
            """
            UPDATE players
               SET cutout_status = 'pending', updated_at = NOW()
             WHERE cutout_status = 'processing'
               AND updated_at < NOW() - (%s || ' minutes')::interval
             RETURNING id
            """,
            (str(max_minutes),),
        )
        rows = cur.fetchall()
        return len(rows)


def claim_pending() -> tuple[str, str, str] | None:
    """Atomic claim. Renvoie (id, site_id, photo_raw_url) ou None si queue
    vide. Le SKIP LOCKED permet plusieurs workers en parallèle sans race."""
    with _db() as conn, conn.cursor() as cur:
        cur.execute(
            """
            UPDATE players SET cutout_status = 'processing', updated_at = NOW()
             WHERE id = (
                SELECT id FROM players
                 WHERE cutout_status = 'pending'
                   AND photo_raw_url IS NOT NULL
                 ORDER BY created_at
                 FOR UPDATE SKIP LOCKED
                 LIMIT 1
             )
             RETURNING id, site_id, photo_raw_url
            """
        )
        row = cur.fetchone()
        return row if row else None


def mark_ready(player_id: str, cutout_url: str) -> None:
    with _db() as conn, conn.cursor() as cur:
        cur.execute(
            """
            UPDATE players
               SET photo_cutout_url = %s,
                   cutout_status = 'ready',
                   updated_at = NOW()
             WHERE id = %s
            """,
            (cutout_url, player_id),
        )


def mark_failed(player_id: str) -> None:
    with _db() as conn, conn.cursor() as cur:
        cur.execute(
            """
            UPDATE players SET cutout_status = 'failed', updated_at = NOW()
             WHERE id = %s
            """,
            (player_id,),
        )


def upload_cutout(buffer: bytes, remote_relative_path: str) -> str:
    """Upload bytes sur FTP sous FTP_BASE_DIR/<remote_relative_path>.
    Crée les dossiers manquants (mkdir -p). Retourne l'URL publique."""
    parts = remote_relative_path.strip("/").split("/")
    filename = parts[-1]
    dirs = parts[:-1]
    ftp = _ftp_login()
    try:
        ftp.cwd(FTP_BASE_DIR)
        for d in dirs:
            try:
                ftp.cwd(d)
            except Exception:
                ftp.mkd(d)
                ftp.cwd(d)
        ftp.storbinary(f"STOR {filename}", BytesIO(buffer))
    finally:
        ftp.quit()
    return f"{FTP_PUBLIC_URL}/{remote_relative_path.lstrip('/')}"


def process_one() -> bool:
    """Process le prochain player en pending. Retourne True si un player a été
    traité (drain loop), False si queue vide."""
    row = claim_pending()
    if not row:
        return False
    player_id, site_id, raw_url = row
    log.info(
        "claimed player_id=%s site_id=%s raw_url=%s",
        player_id, site_id, raw_url,
    )
    try:
        # Download
        resp = requests.get(raw_url, timeout=DOWNLOAD_TIMEOUT)
        resp.raise_for_status()
        log.info("downloaded player_id=%s bytes=%d", player_id, len(resp.content))

        # Cutout via rembg (BiRefNet par défaut). PNG transparent.
        cutout_bytes = remove(resp.content)
        log.info(
            "cutout produced player_id=%s bytes_in=%d bytes_out=%d",
            player_id, len(resp.content), len(cutout_bytes),
        )

        # Upload sous players/{site_id}/{player_id}-cutout.png
        remote_path = f"players/{site_id}/{player_id}-cutout.png"
        cutout_url = upload_cutout(cutout_bytes, remote_path)

        mark_ready(player_id, cutout_url)
        log.info("ready player_id=%s cutout_url=%s", player_id, cutout_url)
        return True
    except Exception as e:
        log.error("failed player_id=%s error=%s", player_id, e, exc_info=True)
        try:
            mark_failed(player_id)
        except Exception as e2:
            log.error("mark_failed crashed too player_id=%s: %s", player_id, e2)
        return True  # On a quand même claim → continue le drain


def main() -> None:
    log.info(
        "rembg worker starting, poll_interval=%ds, stale_recovery=%dmin",
        POLL_INTERVAL_SECONDS, STALE_RECOVERY_MIN,
    )
    try:
        recovered = fail_stale_processing(STALE_RECOVERY_MIN)
        if recovered:
            log.warning("recovered %d stale processing players at boot", recovered)
    except Exception as e:
        log.error("stale recovery failed at boot: %s", e)

    while True:
        try:
            # Drain : traite tout ce qui est pending dans le tick courant.
            while process_one():
                pass
        except Exception as e:
            log.error("tick failed: %s", e, exc_info=True)
        time.sleep(POLL_INTERVAL_SECONDS)


if __name__ == "__main__":
    main()
