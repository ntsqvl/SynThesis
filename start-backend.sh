#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/backend"
[ -f venv/bin/activate ] || {
  rm -rf venv
  python3 -m venv venv
}
. venv/bin/activate
pip install -r requirements.txt
[ -f .env ] || cp .env.example .env
python -m uvicorn main:app --reload --port 8000
