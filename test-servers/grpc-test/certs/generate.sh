#!/usr/bin/env bash
# Regenerates the test-only TLS files for the gRPC test server's TLS port:
# a CA (ca.crt) and a localhost server certificate signed by it (server.crt,
# server.key). The CA key is deleted afterwards; rerun this script to replace
# all three files. Requires OpenSSL 1.1.1 or later.
set -euo pipefail
cd "$(dirname "$0")"

# Git Bash on Windows rewrites "/CN=..." into a file path without this
export MSYS_NO_PATHCONV=1

openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 3650 \
  -keyout ca.key -out ca.crt -subj "/CN=Nouto gRPC Test CA"

openssl req -newkey rsa:2048 -nodes -sha256 \
  -keyout server.key -out server.csr -subj "/CN=localhost"

cat > server.ext <<'EOF'
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = DNS:localhost, IP:127.0.0.1
EOF

openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -sha256 -days 3650 -extfile server.ext -out server.crt

rm -f ca.key ca.srl server.csr server.ext
echo "Wrote ca.crt, server.crt, and server.key"
