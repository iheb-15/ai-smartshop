#!/usr/bin/env sh
set -e
# Peuple la base au premier démarrage (idempotent : ne fait rien si des données existent déjà)
if [ "${SEED_ON_START:-true}" = "true" ]; then
  python seed.py
fi
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
