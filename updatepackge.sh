#!/usr/bin/env bash

set -uo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
WORKSPACE_DIR=$(cd -- "$SCRIPT_DIR/.." && pwd)

PACKAGE_NAME="sevago-library"
TARGET_BRANCH="develop"

VERSION=${1:-$(cd "$SCRIPT_DIR" && node -pe "require('./package.json').version")}
TARGET_VERSION="^$VERSION"
COMMIT_MESSAGE="chore: update sevago-library to v$VERSION"

# ============================================================
# Màu terminal
# ============================================================

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m'

# ============================================================
# Kết quả tổng hợp
# ============================================================

declare -a SUMMARY_PROJECT=()
declare -a SUMMARY_OLD_VERSION=()
declare -a SUMMARY_STATUS=()
declare -a SUMMARY_NOTE=()

add_summary() {
  SUMMARY_PROJECT+=("$1")
  SUMMARY_OLD_VERSION+=("$2")
  SUMMARY_STATUS+=("$3")
  SUMMARY_NOTE+=("$4")
}

# ============================================================
# Package helpers
# ============================================================

has_package() {
  node -e "
    const pkg = require('./package.json');
    const name = process.argv[1];

    const found =
      pkg.dependencies?.[name] ||
      pkg.devDependencies?.[name] ||
      pkg.peerDependencies?.[name];

    process.exit(found ? 0 : 1);
  " "$PACKAGE_NAME"
}

get_current_version() {
  node -e "
    const pkg = require('./package.json');
    const name = process.argv[1];

    const versions = [
      pkg.dependencies?.[name],
      pkg.devDependencies?.[name],
      pkg.peerDependencies?.[name],
    ].filter(Boolean);

    console.log([...new Set(versions)].join(', '));
  " "$PACKAGE_NAME"
}

is_target_version() {
  node -e "
    const pkg = require('./package.json');
    const name = process.argv[1];
    const target = process.argv[2];

    const versions = [
      pkg.dependencies?.[name],
      pkg.devDependencies?.[name],
      pkg.peerDependencies?.[name],
    ].filter(Boolean);

    process.exit(
      versions.length > 0 &&
      versions.every(version => version === target)
        ? 0
        : 1
    );
  " "$PACKAGE_NAME" "$TARGET_VERSION"
}

update_package_version() {
  node -e "
    const fs = require('fs');

    const path = 'package.json';
    const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));

    const name = process.argv[1];
    const version = process.argv[2];

    for (const field of [
      'dependencies',
      'devDependencies',
      'peerDependencies'
    ]) {
      if (pkg[field]?.[name]) {
        pkg[field][name] = version;
      }
    }

    fs.writeFileSync(
      path,
      JSON.stringify(pkg, null, 2) + '\n'
    );
  " "$PACKAGE_NAME" "$TARGET_VERSION"
}

# ============================================================
# Git helpers
# ============================================================

ensure_clean_worktree() {
  [[ -z "$(git status --porcelain)" ]]
}

checkout_develop() {
  git fetch origin "$TARGET_BRANCH" >/dev/null 2>&1 || return 1

  if git show-ref --verify --quiet "refs/heads/$TARGET_BRANCH"; then
    git checkout "$TARGET_BRANCH" >/dev/null 2>&1 || return 1
  else
    git checkout -b "$TARGET_BRANCH" "origin/$TARGET_BRANCH" >/dev/null 2>&1 || return 1
  fi

  git pull --ff-only origin "$TARGET_BRANCH" >/dev/null 2>&1 || return 1
}

# ============================================================
# Header
# ============================================================

echo ""
echo -e "${CYAN}============================================================${NC}"
echo -e "${CYAN} CẬP NHẬT SEVAGO LIBRARY${NC}"
echo -e "${CYAN}============================================================${NC}"
echo ""
echo -e " Package : ${GREEN}$PACKAGE_NAME${NC}"
echo -e " Version : ${GREEN}$TARGET_VERSION${NC}"
echo -e " Branch  : ${GREEN}$TARGET_BRANCH${NC}"
echo -e " Folder  : ${GRAY}$WORKSPACE_DIR${NC}"
echo ""

# ============================================================
# Tìm project
# ============================================================

declare -a PROJECT_DIRS=()

for project_dir in "$WORKSPACE_DIR"/*; do
  [[ -d "$project_dir" ]] || continue
  [[ -f "$project_dir/package.json" ]] || continue
  [[ -d "$project_dir/.git" ]] || continue

  project_name=$(basename "$project_dir")

  # Không update chính repository sevago-library
  [[ "$project_name" != "sevago-library-gitlab" ]] || continue

  cd "$project_dir" || continue

  # Chỉ lấy project đang dùng sevago-library
  if has_package; then
    PROJECT_DIRS+=("$project_dir")
  fi
done

TOTAL=${#PROJECT_DIRS[@]}

if [[ "$TOTAL" -eq 0 ]]; then
  echo -e "${YELLOW}Không tìm thấy project nào đang sử dụng $PACKAGE_NAME.${NC}"
  exit 0
fi

echo -e "Tìm thấy ${GREEN}$TOTAL${NC} project đang sử dụng $PACKAGE_NAME."
echo ""

# ============================================================
# Xử lý từng project
# ============================================================

INDEX=0

for project_dir in "${PROJECT_DIRS[@]}"; do
  INDEX=$((INDEX + 1))

  project_name=$(basename "$project_dir")

  echo -e "${CYAN}------------------------------------------------------------${NC}"
  echo -e "${CYAN}[$INDEX/$TOTAL] $project_name${NC}"
  echo -e "${CYAN}------------------------------------------------------------${NC}"

  cd "$project_dir" || {
    echo -e "${RED}✗ Không thể truy cập project.${NC}"
    add_summary "$project_name" "-" "LỖI" "Không thể truy cập folder"
    echo ""
    continue
  }

  # ----------------------------------------------------------
  # 1. Kiểm tra source sạch
  # ----------------------------------------------------------

  if ! ensure_clean_worktree; then
    echo -e "${RED}✗ Source đang có thay đổi chưa commit.${NC}"
    git status --short

    add_summary \
      "$project_name" \
      "-" \
      "LỖI" \
      "Có thay đổi chưa commit"

    echo ""
    continue
  fi

  # ----------------------------------------------------------
  # 2. Pull develop
  # ----------------------------------------------------------

  echo -e "${GRAY}→ Pull develop mới nhất...${NC}"

  if ! checkout_develop; then
    echo -e "${RED}✗ Không thể checkout/pull develop.${NC}"

    add_summary \
      "$project_name" \
      "-" \
      "LỖI" \
      "Pull develop thất bại"

    echo ""
    continue
  fi

  # ----------------------------------------------------------
  # 3. Kiểm tra version
  # ----------------------------------------------------------

  CURRENT_VERSION=$(get_current_version)

  echo -e "  Hiện tại : ${YELLOW}$CURRENT_VERSION${NC}"
  echo -e "  Mục tiêu : ${GREEN}$TARGET_VERSION${NC}"

  if is_target_version; then
    echo -e "${GREEN}✓ Đã đúng version → bỏ qua.${NC}"

    add_summary \
      "$project_name" \
      "$CURRENT_VERSION" \
      "BỎ QUA" \
      "Đã ở $TARGET_VERSION"

    echo ""
    continue
  fi

  # ----------------------------------------------------------
  # 4. Update package.json
  # ----------------------------------------------------------

  echo -e "${GRAY}→ Cập nhật package.json...${NC}"

  if ! update_package_version; then
    echo -e "${RED}✗ Cập nhật package.json thất bại.${NC}"

    add_summary \
      "$project_name" \
      "$CURRENT_VERSION" \
      "LỖI" \
      "Update package.json thất bại"

    echo ""
    continue
  fi

  # ----------------------------------------------------------
  # 5. Update package-lock.json
  # ----------------------------------------------------------

  echo -e "${GRAY}→ Cập nhật package-lock.json...${NC}"

  if ! npm install \
    --force \
    --package-lock-only \
    --ignore-scripts \
    >/dev/null 2>&1; then

    echo -e "${RED}✗ npm install thất bại.${NC}"

    # Trả source lại trạng thái ban đầu
    git restore package.json package-lock.json 2>/dev/null || true

    add_summary \
      "$project_name" \
      "$CURRENT_VERSION" \
      "LỖI" \
      "npm install thất bại"

    echo ""
    continue
  fi

  # ----------------------------------------------------------
  # 6. Nếu không có thay đổi
  # ----------------------------------------------------------

  if [[ -z "$(git status --porcelain -- package.json package-lock.json)" ]]; then
    echo -e "${YELLOW}→ Không có thay đổi cần commit.${NC}"

    add_summary \
      "$project_name" \
      "$CURRENT_VERSION" \
      "BỎ QUA" \
      "Không phát sinh thay đổi"

    echo ""
    continue
  fi

  # ----------------------------------------------------------
  # 7. Commit
  # ----------------------------------------------------------

  echo -e "${GRAY}→ Commit...${NC}"

  git add package.json

  if [[ -f package-lock.json ]]; then
    git add package-lock.json
  fi

  if ! git commit -m "$COMMIT_MESSAGE" >/dev/null 2>&1; then
    echo -e "${RED}✗ Commit thất bại.${NC}"

    add_summary \
      "$project_name" \
      "$CURRENT_VERSION" \
      "LỖI" \
      "Commit thất bại"

    echo ""
    continue
  fi

  # ----------------------------------------------------------
  # 8. Push
  # ----------------------------------------------------------

  echo -e "${GRAY}→ Push origin/$TARGET_BRANCH...${NC}"

  if ! git push origin "$TARGET_BRANCH" >/dev/null 2>&1; then
    echo -e "${RED}✗ Push thất bại.${NC}"

    add_summary \
      "$project_name" \
      "$CURRENT_VERSION" \
      "LỖI" \
      "Đã commit nhưng push thất bại"

    echo ""
    continue
  fi

  echo -e "${GREEN}✓ Cập nhật thành công.${NC}"

  add_summary \
    "$project_name" \
    "$CURRENT_VERSION" \
    "THÀNH CÔNG" \
    "$CURRENT_VERSION → $TARGET_VERSION"

  echo ""
done

# ============================================================
# Tổng kết
# ============================================================

echo ""
echo -e "${CYAN}================================================================================================================${NC}"
echo -e "${CYAN} TỔNG KẾT${NC}"
echo -e "${CYAN}================================================================================================================${NC}"

printf "%-30s | %-18s | %-17s | %s\n" \
  "PROJECT" \
  "VERSION CŨ" \
  "TRẠNG THÁI" \
  "GHI CHÚ"

printf "%-30s-+-%-18s-+-%-15s-+-%s\n" \
  "------------------------------" \
  "------------------" \
  "---------------" \
  "----------------------------------------"

SUCCESS_COUNT=0
SKIP_COUNT=0
ERROR_COUNT=0

for i in "${!SUMMARY_PROJECT[@]}"; do
  project="${SUMMARY_PROJECT[$i]}"
  old_version="${SUMMARY_OLD_VERSION[$i]}"
  status="${SUMMARY_STATUS[$i]}"
  note="${SUMMARY_NOTE[$i]}"

  printf "%-30s | %-18s | %-15s | %s\n" \
    "$project" \
    "$old_version" \
    "$status" \
    "$note"

  case "$status" in
    "THÀNH CÔNG")
      SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
      ;;
    "BỎ QUA")
      SKIP_COUNT=$((SKIP_COUNT + 1))
      ;;
    "LỖI")
      ERROR_COUNT=$((ERROR_COUNT + 1))
      ;;
  esac
done

echo ""
echo -e "${GREEN}Thành công : $SUCCESS_COUNT${NC}"
echo -e "${YELLOW}Bỏ qua    : $SKIP_COUNT${NC}"

if [[ "$ERROR_COUNT" -gt 0 ]]; then
  echo -e "${RED}Lỗi        : $ERROR_COUNT${NC}"
else
  echo -e "${GREEN}Lỗi        : 0${NC}"
fi

echo ""
echo -e "Hoàn tất cập nhật ${GREEN}$PACKAGE_NAME $TARGET_VERSION${NC}."
echo ""