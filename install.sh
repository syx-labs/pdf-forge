#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────────────
# pdf-forge · Cross-Platform Skill Installer
# Creates symlinks so every supported agent discovers the skill.
#
# Usage:
#   ./install.sh              # Install to all detected platforms
#   ./install.sh --dry-run    # Preview without changes
#   ./install.sh --uninstall  # Remove all symlinks and env var
# ──────────────────────────────────────────────────────────────────────

PDF_FORGE_ROOT="$(cd "$(dirname "$0")" && pwd)"
SKILL_SOURCE="$PDF_FORGE_ROOT/skills/pdf-forge"
HOME_DIR="$HOME"

DRY_RUN=false
UNINSTALL=false

for arg in "$@"; do
  case "$arg" in
    --dry-run)  DRY_RUN=true ;;
    --uninstall) UNINSTALL=true ;;
    --help|-h)
      echo "Usage: ./install.sh [--dry-run] [--uninstall]"
      exit 0
      ;;
  esac
done

# ── Colors ───────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
DIM='\033[2m'
RESET='\033[0m'

info()  { echo -e "${GREEN}✓${RESET} $1"; }
warn()  { echo -e "${YELLOW}⚠${RESET} $1"; }
skip()  { echo -e "${DIM}–${RESET} $1"; }
err()   { echo -e "${RED}✗${RESET} $1"; }

# ── Platform definitions ─────────────────────────────────────────────
# Canonical location — all other platforms symlink to this.
CANONICAL_DIR="$HOME_DIR/.agents/skills"
CANONICAL_LINK="$CANONICAL_DIR/pdf-forge"

# Secondary platforms that symlink to the canonical location.
# Uses relative path: ../../.agents/skills/pdf-forge
PLATFORMS=(
  "$HOME_DIR/.claude/skills"
  "$HOME_DIR/.cursor/skills"
  "$HOME_DIR/.codex/skills"
  "$HOME_DIR/.augment/skills"
  "$HOME_DIR/.warp/skills"
  "$HOME_DIR/.gemini/skills"
  "$HOME_DIR/.copilot/skills"
  "$HOME_DIR/.github/skills"
  "$HOME_DIR/.opencode/skills"
  "$HOME_DIR/.factory/skills"
)

# ── Shell profile detection ──────────────────────────────────────────
detect_shell_profile() {
  local shell_name
  shell_name="$(basename "$SHELL")"

  case "$shell_name" in
    zsh)
      if [[ -f "$HOME_DIR/.zshrc" ]]; then
        echo "$HOME_DIR/.zshrc"
      else
        echo "$HOME_DIR/.zprofile"
      fi
      ;;
    bash)
      if [[ -f "$HOME_DIR/.bashrc" ]]; then
        echo "$HOME_DIR/.bashrc"
      elif [[ -f "$HOME_DIR/.bash_profile" ]]; then
        echo "$HOME_DIR/.bash_profile"
      else
        echo "$HOME_DIR/.profile"
      fi
      ;;
    fish)
      echo "$HOME_DIR/.config/fish/config.fish"
      ;;
    *)
      echo "$HOME_DIR/.profile"
      ;;
  esac
}

SHELL_PROFILE="$(detect_shell_profile)"
ENV_MARKER="# pdf-forge"
ENV_LINE="export PDF_FORGE_HOME=\"$PDF_FORGE_ROOT\" $ENV_MARKER"

# ── Helpers ──────────────────────────────────────────────────────────
create_symlink() {
  local target="$1"
  local link="$2"
  local label="$3"

  if [[ -L "$link" ]]; then
    local current_target
    current_target="$(readlink "$link")"
    if [[ "$current_target" == "$target" ]]; then
      skip "$label (já existe)"
      return
    fi
    if $DRY_RUN; then
      warn "$label → atualizaria symlink"
      return
    fi
    rm "$link"
  elif [[ -e "$link" ]]; then
    warn "$label — diretório real existe, pulando (remova manualmente se quiser substituir)"
    return
  fi

  if $DRY_RUN; then
    info "$label → criaria symlink"
    return
  fi

  mkdir -p "$(dirname "$link")"
  ln -s "$target" "$link"
  info "$label"
}

remove_symlink() {
  local link="$1"
  local label="$2"

  if [[ -L "$link" ]]; then
    if $DRY_RUN; then
      info "$label → removeria symlink"
    else
      rm "$link"
      info "$label — removido"
    fi
  else
    skip "$label (não é symlink)"
  fi
}

# ── Uninstall ────────────────────────────────────────────────────────
if $UNINSTALL; then
  echo ""
  echo -e "${CYAN}pdf-forge${RESET} · Desinstalando..."
  echo ""

  # Remove platform symlinks
  for platform_dir in "${PLATFORMS[@]}"; do
    local_link="$platform_dir/pdf-forge"
    platform_name="$(basename "$(dirname "$platform_dir")")"
    remove_symlink "$local_link" "$platform_name"
  done

  # Remove canonical symlink
  remove_symlink "$CANONICAL_LINK" "agents (canônico)"

  # Remove env var from shell profile
  if [[ -f "$SHELL_PROFILE" ]] && grep -q "$ENV_MARKER" "$SHELL_PROFILE"; then
    if $DRY_RUN; then
      info "Removeria PDF_FORGE_HOME de $SHELL_PROFILE"
    else
      sed -i '' "/$ENV_MARKER/d" "$SHELL_PROFILE"
      info "PDF_FORGE_HOME removido de $SHELL_PROFILE"
    fi
  else
    skip "PDF_FORGE_HOME não encontrado em $SHELL_PROFILE"
  fi

  echo ""
  if ! $DRY_RUN; then
    echo -e "${GREEN}Desinstalação concluída.${RESET}"
  else
    echo -e "${YELLOW}(dry-run — nenhuma alteração feita)${RESET}"
  fi
  exit 0
fi

# ── Install ──────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}pdf-forge${RESET} · Instalando skill cross-platform..."
echo -e "${DIM}Projeto: $PDF_FORGE_ROOT${RESET}"
echo ""

# Validate skill source
if [[ ! -f "$SKILL_SOURCE/SKILL.md" ]]; then
  err "SKILL.md não encontrado em $SKILL_SOURCE"
  exit 1
fi

# 1. Canonical symlink: ~/.agents/skills/pdf-forge → project/skills/pdf-forge/
echo -e "${CYAN}Canônico${RESET}"
create_symlink "$SKILL_SOURCE" "$CANONICAL_LINK" "  ~/.agents/skills/pdf-forge"
echo ""

# 2. Platform symlinks: ~/.{platform}/skills/pdf-forge → ../../.agents/skills/pdf-forge
echo -e "${CYAN}Plataformas${RESET}"
for platform_dir in "${PLATFORMS[@]}"; do
  local_link="$platform_dir/pdf-forge"
  platform_name="$(basename "$(dirname "$platform_dir")")"

  # Only create if parent platform dir exists (platform is installed)
  parent_of_skills="$(dirname "$platform_dir")"
  if [[ -d "$parent_of_skills" ]]; then
    # Relative symlink: from ~/.{platform}/skills/pdf-forge → ../../.agents/skills/pdf-forge
    relative_target="../../.agents/skills/pdf-forge"
    create_symlink "$relative_target" "$local_link" "  $platform_name"
  else
    skip "  $platform_name (não instalado)"
  fi
done
echo ""

# 3. Environment variable
echo -e "${CYAN}Ambiente${RESET}"
if [[ -f "$SHELL_PROFILE" ]] && grep -q "$ENV_MARKER" "$SHELL_PROFILE"; then
  # Update existing entry
  if $DRY_RUN; then
    skip "  PDF_FORGE_HOME (já configurado em $SHELL_PROFILE)"
  else
    sed -i '' "/$ENV_MARKER/d" "$SHELL_PROFILE"
    echo "$ENV_LINE" >> "$SHELL_PROFILE"
    info "  PDF_FORGE_HOME atualizado em $SHELL_PROFILE"
  fi
else
  if $DRY_RUN; then
    info "  Adicionaria PDF_FORGE_HOME a $SHELL_PROFILE"
  else
    echo "" >> "$SHELL_PROFILE"
    echo "$ENV_LINE" >> "$SHELL_PROFILE"
    info "  PDF_FORGE_HOME adicionado a $SHELL_PROFILE"
  fi
fi

# 4. Export for current session
if ! $DRY_RUN; then
  export PDF_FORGE_HOME="$PDF_FORGE_ROOT"
fi

echo ""
if $DRY_RUN; then
  echo -e "${YELLOW}(dry-run — nenhuma alteração feita)${RESET}"
else
  echo -e "${GREEN}Instalação concluída!${RESET}"
  echo ""
  echo -e "  Recarregue o shell: ${CYAN}source $SHELL_PROFILE${RESET}"
  echo -e "  Ou abra um novo terminal."
  echo ""
  echo -e "  ${DIM}A skill pdf-forge agora está disponível em:"
  echo -e "  Warp, Claude Code, Cursor, Codex, Augment Code, Gemini e mais.${RESET}"
fi
