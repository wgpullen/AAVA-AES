#!/bin/bash
# Start AES dev server with CORS proxy to int-ai.aava.ai
echo "Starting Autonomous Engineering Studio..."
echo "  → Proxying /aava-api/* → https://int-ai.aava.ai"
echo "  → Open http://localhost:4200"
npx ng serve --port 4200 --proxy-config proxy.conf.json "$@"
