#!/bin/sh
set -eu

# Defaults
REALM=${TURN_REALM:-online-battle.local}
PUBLIC_IP=${TURN_PUBLIC_IP:-127.0.0.1}
LISTEN_IP=${TURN_LISTEN_IP:-0.0.0.0}
MIN_PORT=${TURN_MIN_PORT:-49152}
MAX_PORT=${TURN_MAX_PORT:-49252}
USER_PAIR=${TURN_USER:-${TURN_USERNAME:-demo}:${TURN_PASSWORD:-demo}}
CONF_PATH=/etc/turnserver.conf

# Build args from env; prefer config file but override with env-driven flags
ARGS="-c $CONF_PATH"
ARGS="$ARGS --realm=$REALM --server-name=$REALM"
ARGS="$ARGS --external-ip=$PUBLIC_IP"
ARGS="$ARGS --listening-ip=$LISTEN_IP"
ARGS="$ARGS --min-port=$MIN_PORT --max-port=$MAX_PORT"
ARGS="$ARGS --user=$USER_PAIR"
ARGS="$ARGS --fingerprint --lt-cred-mech"

# No TLS/DTLS by default for dev
ARGS="$ARGS --no-tls --no-dtls"

exec /usr/bin/turnserver $ARGS

