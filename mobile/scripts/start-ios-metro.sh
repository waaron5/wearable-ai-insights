#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST_MODE="localhost"
PORT="8081"
API_URL=""

usage() {
  echo "Usage: npm run ios:metro -- [--host <localhost|lan>] [--api-url <url>] [--port <port>]"
}

detect_lan_ip() {
  local iface ip default_iface

  ip_for_interface() {
    local target_iface="$1"
    local detected_ip=""

    detected_ip="$(ipconfig getifaddr "$target_iface" 2>/dev/null || true)"
    if [[ -z "$detected_ip" ]]; then
      detected_ip="$(ifconfig "$target_iface" 2>/dev/null | awk '/inet / { print $2; exit }' || true)"
    fi

    if [[ -n "$detected_ip" && "$detected_ip" != 127.* && "$detected_ip" != 169.254.* ]]; then
      echo "$detected_ip"
      return 0
    fi

    return 1
  }

  default_iface="$(route -n get default 2>/dev/null | awk '/interface: / { print $2; exit }' || true)"
  if [[ -n "$default_iface" ]]; then
    ip="$(ip_for_interface "$default_iface" || true)"
    if [[ -n "$ip" ]]; then
      echo "$ip"
      return 0
    fi
  fi

  for iface in en0 en1; do
    ip="$(ip_for_interface "$iface" || true)"
    if [[ -n "$ip" ]]; then
      echo "$ip"
      return 0
    fi
  done

  while read -r iface; do
    ip="$(ip_for_interface "$iface" || true)"
    if [[ -n "$ip" ]]; then
      echo "$ip"
      return 0
    fi
  done < <(ifconfig -l | tr ' ' '\n')

  return 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host)
      HOST_MODE="$2"
      shift 2
      ;;
    --api-url)
      API_URL="$2"
      shift 2
      ;;
    --port)
      PORT="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      usage
      exit 1
      ;;
  esac
done

if [[ "$HOST_MODE" != "localhost" && "$HOST_MODE" != "lan" ]]; then
  echo "Unsupported host mode: $HOST_MODE"
  echo "Use 'localhost' for the simulator or 'lan' for a physical iPhone."
  exit 1
fi

if [[ -z "$API_URL" ]]; then
  if [[ "$HOST_MODE" == "lan" ]]; then
    LAN_IP="$(detect_lan_ip || true)"
    if [[ -z "${LAN_IP:-}" ]]; then
      echo "Could not determine this Mac's LAN IP. Pass --api-url explicitly."
      exit 1
    fi
    API_URL="http://${LAN_IP}:8000"
  else
    API_URL="http://127.0.0.1:8000"
  fi
fi

echo "Starting Metro for iOS dev client"
echo "Host mode: $HOST_MODE"
echo "DEV_API_URL: $API_URL"
echo "Port: $PORT"

cd "$PROJECT_ROOT"
export DEV_API_URL="$API_URL"
exec npx expo start --dev-client --port "$PORT" --host "$HOST_MODE"
