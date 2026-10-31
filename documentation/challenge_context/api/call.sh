#!/usr/bin/env bash
# Usage: ./call.sh <operationId> [json-body | @file.json]
# Example: ./call.sh APICalc_getAgeLimits '{"Sex":1,"BirthYear":1985}'
#          ./call.sh APICalc_calculateRisk @examples/APICalc_calculateRisk.request.json
set -euo pipefail
cd "$(dirname "$0")"
source .env
curl -sS -X POST "$LOGISMATA_API_BASE/operation/standard/$1" \
  -H "Authorization: Bearer $LOGISMATA_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "${2:-{\}}"
echo
