#!/bin/sh
# CF-221: make sure the local SLM is available in the Ollama runtime.
# Runs as a one-shot container (service `ollama-init`); safe to re-run: if the model is
# already in the persisted volume nothing is downloaded.
set -eu

OLLAMA_HOST="${OLLAMA_HOST:-http://ollama:11434}"
export OLLAMA_HOST
MODELS="${OLLAMA_MODELS_TO_PULL:-${OLLAMA_MODEL:-qwen2.5:7b-instruct}}"

echo "[OLLAMA-INIT] Waiting for Ollama at ${OLLAMA_HOST}..."
until ollama list >/dev/null 2>&1; do
    sleep 2
done

for model in $MODELS; do
    if ollama list | awk 'NR>1 {print $1}' | grep -qx "$model"; then
        echo "[OLLAMA-INIT] ${model} already present, skipping pull."
    else
        echo "[OLLAMA-INIT] Pulling ${model} (first run only, this can take several minutes)..."
        ollama pull "$model"
    fi
done

echo "[OLLAMA-INIT] Ready."
