#!/usr/bin/env bash

set -euo pipefail

PACKAGE_NAME=$(node -pe "require('./package.json').name")
VERSION_BEFORE=$(node -pe "require('./package.json').version")

echo "Checking npm authentication..."
npm whoami >/dev/null

echo "Applying Changesets..."
npm run version

VERSION_AFTER=$(node -pe "require('./package.json').version")

echo "Installing lockfile update..."
npm install --package-lock-only --ignore-scripts

echo "Building Storybook..."
npm run build-storybook

echo "Staging files..."
git add .

echo "Creating release commit..."
git commit -m "chore: release v$VERSION_AFTER" || echo "No changes to commit."

echo "Publishing package..."
npm run release

echo "Pushing release commit and tags..."
git push --follow-tags

echo ""
echo "✅ Release completed"
echo "📦 Package: $PACKAGE_NAME"
echo "🏷️ Version: v$VERSION_BEFORE → v$VERSION_AFTER"