#!/usr/bin/env bash
set -euo pipefail

log() {
  printf '%s\n' "$*"
}

has_cmd() {
  command -v "$1" >/dev/null 2>&1
}

is_interactive() {
  [ -t 0 ] && [ -t 1 ]
}

run_privileged() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
    return 0
  fi
  if has_cmd sudo && is_interactive; then
    sudo "$@"
    return 0
  fi
  return 1
}

install_macos() {
  if ! has_cmd brew; then
    log "Homebrew is required for dependency install on macOS."
    log "Install Homebrew first: https://brew.sh/"
    return 2
  fi

  local pkgs=()
  if ! has_cmd python3; then
    pkgs+=("python")
  fi
  if ! has_cmd ssh; then
    pkgs+=("openssh")
  fi
  if ! has_cmd rsync; then
    pkgs+=("rsync")
  fi

  if [ "${#pkgs[@]}" -eq 0 ]; then
    log "Dependencies already installed."
    return 0
  fi

  log "Installing via Homebrew: ${pkgs[*]}"
  brew install "${pkgs[@]}"
  return 0
}

install_linux() {
  local manager=""
  if has_cmd apt-get; then
    manager="apt"
  elif has_cmd dnf; then
    manager="dnf"
  elif has_cmd yum; then
    manager="yum"
  elif has_cmd pacman; then
    manager="pacman"
  elif has_cmd zypper; then
    manager="zypper"
  fi

  if [ -z "$manager" ]; then
    log "Unsupported Linux package manager. Install manually: python3, openssh-client, rsync."
    return 2
  fi

  case "$manager" in
    apt)
      if run_privileged apt-get update; then
        run_privileged apt-get install -y python3 openssh-client rsync || return 2
      else
        log "Run manually: sudo apt-get update && sudo apt-get install -y python3 openssh-client rsync"
        return 2
      fi
      ;;
    dnf)
      if run_privileged dnf install -y python3 openssh-clients rsync; then
        :
      else
        log "Run manually: sudo dnf install -y python3 openssh-clients rsync"
        return 2
      fi
      ;;
    yum)
      if run_privileged yum install -y python3 openssh-clients rsync; then
        :
      else
        log "Run manually: sudo yum install -y python3 openssh-clients rsync"
        return 2
      fi
      ;;
    pacman)
      if run_privileged pacman -Sy --noconfirm python openssh rsync; then
        :
      else
        log "Run manually: sudo pacman -Sy --noconfirm python openssh rsync"
        return 2
      fi
      ;;
    zypper)
      if run_privileged zypper --non-interactive install python3 openssh rsync; then
        :
      else
        log "Run manually: sudo zypper --non-interactive install python3 openssh rsync"
        return 2
      fi
      ;;
  esac
  return 0
}

main() {
  local os
  os="$(uname -s)"

  case "$os" in
    Darwin) install_macos ;;
    Linux) install_linux ;;
    *)
      log "Unsupported OS for automatic dependency install: $os"
      return 2
      ;;
  esac

  if has_cmd python3 && has_cmd ssh && has_cmd rsync; then
    log "Dependencies ready: python3, ssh, rsync"
    return 0
  fi

  log "Dependency install incomplete. Ensure python3, ssh, and rsync are available."
  return 2
}

main "$@"
