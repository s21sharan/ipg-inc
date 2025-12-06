#!/bin/bash

batches=(
  "batch_6926682cd4948190aa2230189ef8f68a"
  "batch_6926682e1ccc8190846f08017e055219"
  "batch_6926682efc708190a413de642d38e8e3"
  "batch_6926682fe0b88190818adf064407bab0"
)

for i in "${!batches[@]}"; do
  batch_id="${batches[$i]}"
  echo "=== BATCH $((i+1)) - ${batch_id} ==="
  curl -s "https://api.openai.com/v1/batches/${batch_id}" \
    -H "Authorization: Bearer ${OPENAI_API_KEY}" | \
    jq -r '"Status: \(.status)\nCompleted: \(.request_counts.completed)/\(.request_counts.total)\nCompleted at: \(.completed_at // "N/A")"'
  echo
done
