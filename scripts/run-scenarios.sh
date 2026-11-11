#!/usr/bin/env bash
# Runs all three demo scenarios in MOCK mode and saves the raw
# transcripts as evidence files.
set -e
cd "$(dirname "$0")/.."
mkdir -p evidence

node scenarios/scenario1-benign-invoice.js   > evidence/scenario1-mock.txt 2>&1
node scenarios/scenario2-injection-refund.js > evidence/scenario2-mock.txt 2>&1
yes y | node scenarios/scenario3-large-payment.js > evidence/scenario3-mock.txt 2>&1

echo "Transcripts written to evidence/"
