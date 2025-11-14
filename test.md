[SYSTEM]
You are Oracle, a focused one-shot problem solver. Emphasize direct answers, cite any files referenced, and clearly note when the search tool was used.

[USER]
hi

[FILE: ../Peekaboo/scripts/poltergeist-switch.sh]
#!/bin/bash

# Script to switch between local and npm versions of Poltergeist

PACKAGE_JSON="package.json"

case "$1" in
  "local")
    echo "🏠 Switching to local Poltergeist..."
    # Using npx with local path
    sed -i '' 's|"poltergeist:\([^"]*\)": "npx @steipete/poltergeist@latest \([^"]*\)"|"poltergeist:\1": "npx ../poltergeist \2"|g' $PACKAGE_JSON
    sed -i '' 's|"poltergeist:\([^"]*\)": "node ../poltergeist/dist/cli.js \([^"]*\)"|"poltergeist:\1": "npx ../poltergeist \2"|g' $PACKAGE_JSON
    echo "✅ Switched to local version (npx ../poltergeist)"
    ;;
    
  "npm")
    echo "📦 Switching to npm Poltergeist..."
    # Using npm package
    sed -i '' 's|"poltergeist:\([^"]*\)": "npx ../poltergeist \([^"]*\)"|"poltergeist:\1": "npx @steipete/poltergeist@latest \2"|g' $PACKAGE_JSON
    sed -i '' 's|"poltergeist:\([^"]*\)": "node ../poltergeist/dist/cli.js \([^"]*\)"|"poltergeist:\1": "npx @steipete/poltergeist@latest \2"|g' $PACKAGE_JSON
    echo "✅ Switched to npm version (npx @steipete/poltergeist@latest)"
    ;;
    
  "status")
    echo "📊 Current Poltergeist setup:"
    grep -E '"poltergeist:' $PACKAGE_JSON | head -1
    ;;
    
  *)
    echo "Usage: $0 {local|npm|status}"
    echo ""
    echo "  local  - Use local Poltergeist from ../poltergeist"
    echo "  npm    - Use npm package @steipete/poltergeist"  
    echo "  status - Show current configuration"
    exit 1
    ;;
esac

[FILE: ../Peekaboo/scripts/run-commander-binder-tests.sh]
#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
LOG_PATH="/tmp/commander-binder.log"
{
  echo "===== CommanderBinderTests $(date -u '+%Y-%m-%d %H:%M:%SZ') ====="
  ./runner swift test --package-path Apps/CLI --filter CommanderBinderTests
} 2>&1 | tee >(cat >> "${LOG_PATH}")

[FILE: ../Peekaboo/scripts/build-mac-debug.sh]
#!/bin/bash
# Build script for macOS Peekaboo app using xcodebuild

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Build configuration
WORKSPACE="$PROJECT_ROOT/Apps/Peekaboo.xcworkspace"
SCHEME="Peekaboo"
CONFIGURATION="Debug"
DERIVED_DATA_PATH="$PROJECT_ROOT/.build/DerivedData"

# Check if workspace exists
if [ ! -d "$WORKSPACE" ]; then
    echo -e "${RED}Error: Workspace not found at $WORKSPACE${NC}" >&2
    exit 1
fi

echo -e "${CYAN}Building Peekaboo Mac app (${CONFIGURATION})...${NC}"

# Build the app
xcodebuild \
    -workspace "$WORKSPACE" \
    -scheme "$SCHEME" \
    -configuration "$CONFIGURATION" \
    -derivedDataPath "$DERIVED_DATA_PATH" \
    -destination "platform=macOS" \
    build \
    ONLY_ACTIVE_ARCH=YES \
    CODE_SIGN_IDENTITY="" \
    CODE_SIGNING_REQUIRED=NO \
    CODE_SIGN_ENTITLEMENTS="" \
    CODE_SIGNING_ALLOWED=NO

BUILD_EXIT_CODE=$?

if [ $BUILD_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}✅ Build successful${NC}"
    
    # Find and report the app location
    APP_PATH=$(find "$DERIVED_DATA_PATH" -name "Peekaboo.app" -type d | grep -E "Build/Products/${CONFIGURATION}" | head -1)
    if [ -n "$APP_PATH" ]; then
        echo -e "${GREEN}📦 App built at: $APP_PATH${NC}"
    fi
else
    echo -e "${RED}❌ Build failed with exit code $BUILD_EXIT_CODE${NC}" >&2
    exit $BUILD_EXIT_CODE
fi

[FILE: ../Peekaboo/scripts/release-binaries.sh]
#!/bin/bash
set -e

# Release script for Peekaboo binaries
# This script builds universal binaries and prepares GitHub release artifacts

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Script directory and project root
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$PROJECT_ROOT/build"
RELEASE_DIR="$PROJECT_ROOT/release"

echo -e "${BLUE}🚀 Peekaboo Release Build Script${NC}"

# Parse command line arguments
SKIP_CHECKS=false
CREATE_GITHUB_RELEASE=false
PUBLISH_NPM=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-checks)
            SKIP_CHECKS=true
            shift
            ;;
        --create-github-release)
            CREATE_GITHUB_RELEASE=true
            shift
            ;;
        --publish-npm)
            PUBLISH_NPM=true
            shift
            ;;
        --help)
            echo "Usage: $0 [options]"
            echo "Options:"
            echo "  --skip-checks          Skip pre-release checks"
            echo "  --create-github-release Create draft GitHub release"
            echo "  --publish-npm          Publish to npm after building"
            echo "  --help                 Show this help message"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# Step 1: Run pre-release checks (unless skipped)
if [ "$SKIP_CHECKS" = false ]; then
    echo -e "\n${BLUE}Running pre-release checks...${NC}"
    if ! npm run prepare-release; then
        echo -e "${RED}❌ Pre-release checks failed!${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ All checks passed${NC}"
fi

# Step 2: Clean previous builds
echo -e "\n${BLUE}Cleaning previous builds...${NC}"
rm -rf "$BUILD_DIR" "$RELEASE_DIR"
mkdir -p "$BUILD_DIR" "$RELEASE_DIR"

# Step 3: Read version from package.json
VERSION=$(node -p "require('$PROJECT_ROOT/package.json').version")
echo -e "${BLUE}Building version: ${VERSION}${NC}"

# Step 4: Build universal binary
echo -e "\n${BLUE}Building universal binary...${NC}"
if ! npm run build:swift; then
    echo -e "${RED}❌ Swift build failed!${NC}"
    exit 1
fi

# Step 5: Create release artifacts
echo -e "\n${BLUE}Creating release artifacts...${NC}"

# Create CLI release directory
CLI_RELEASE_DIR="$BUILD_DIR/peekaboo-macos-universal"
mkdir -p "$CLI_RELEASE_DIR"

# Copy files for CLI release
cp "$PROJECT_ROOT/peekaboo" "$CLI_RELEASE_DIR/"
cp "$PROJECT_ROOT/LICENSE" "$CLI_RELEASE_DIR/"
echo "$VERSION" > "$CLI_RELEASE_DIR/VERSION"

# Create minimal README for binary distribution
cat > "$CLI_RELEASE_DIR/README.md" << EOF
# Peekaboo CLI v${VERSION}

Lightning-fast macOS screenshots & AI vision analysis.

## Installation

\`\`\`bash
# Make binary executable
chmod +x peekaboo

# Move to your PATH
sudo mv peekaboo /usr/local/bin/

# Verify installation
peekaboo --version
\`\`\`

## Quick Start

\`\`\`bash
# Capture screenshot
peekaboo image --app Safari --path screenshot.png

# List applications
peekaboo list apps

# Analyze image with AI
peekaboo analyze image.png "What is shown?"
\`\`\`

## Documentation

Full documentation: https://github.com/steipete/peekaboo

## License

MIT License - see LICENSE file
EOF

# Create tarball
echo -e "${BLUE}Creating tarball...${NC}"
cd "$BUILD_DIR"
tar -czf "$RELEASE_DIR/peekaboo-macos-universal.tar.gz" "peekaboo-macos-universal"

# Create npm package tarball
echo -e "${BLUE}Creating npm package...${NC}"
cd "$PROJECT_ROOT"
NPM_PACK_OUTPUT=$(npm pack --pack-destination "$RELEASE_DIR" 2>&1)
NPM_PACKAGE=$(echo "$NPM_PACK_OUTPUT" | grep -o '[^ ]*\.tgz' | tail -1)

if [ -z "$NPM_PACKAGE" ]; then
    echo -e "${RED}❌ Failed to create npm package${NC}"
    exit 1
fi

# Step 6: Generate checksums
echo -e "\n${BLUE}Generating checksums...${NC}"
cd "$RELEASE_DIR"

# Generate SHA256 checksums
if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 peekaboo-macos-universal.tar.gz > checksums.txt
    shasum -a 256 "$(basename "$NPM_PACKAGE")" >> checksums.txt
else
    echo -e "${YELLOW}⚠️  shasum not found, skipping checksum generation${NC}"
fi

# Step 7: Create release notes
echo -e "\n${BLUE}Generating release notes...${NC}"
cat > "$RELEASE_DIR/release-notes.md" << EOF
# Peekaboo v${VERSION}

## Installation

### Homebrew (Recommended)
\`\`\`bash
brew tap steipete/peekaboo
brew install peekaboo
\`\`\`

### Direct Download
\`\`\`bash
curl -L https://github.com/steipete/peekaboo/releases/download/v${VERSION}/peekaboo-macos-universal.tar.gz | tar xz
sudo mv peekaboo-macos-universal/peekaboo /usr/local/bin/
\`\`\`

### npm (includes MCP server)
\`\`\`bash
npm install -g @steipete/peekaboo-mcp
\`\`\`

## What's New

[Add changelog entries here]

## Checksums

\`\`\`
$(cat checksums.txt 2>/dev/null || echo "See checksums.txt")
\`\`\`
EOF

# Step 8: Display results
echo -e "\n${GREEN}✅ Release artifacts created successfully!${NC}"
echo -e "${BLUE}Release directory: ${RELEASE_DIR}${NC}"
echo -e "${BLUE}Artifacts:${NC}"
ls -la "$RELEASE_DIR"

# Step 9: Create GitHub release (if requested)
if [ "$CREATE_GITHUB_RELEASE" = true ]; then
    echo -e "\n${BLUE}Creating GitHub release draft...${NC}"
    
    if ! command -v gh >/dev/null 2>&1; then
        echo -e "${RED}❌ GitHub CLI (gh) not found. Install with: brew install gh${NC}"
        exit 1
    fi
    
    # Create release
    gh release create "v${VERSION}" \
        --draft \
        --title "v${VERSION}" \
        --notes-file "$RELEASE_DIR/release-notes.md" \
        "$RELEASE_DIR/peekaboo-macos-universal.tar.gz" \
        "$RELEASE_DIR/$(basename "$NPM_PACKAGE")" \
        "$RELEASE_DIR/checksums.txt"
    
    echo -e "${GREEN}✅ GitHub release draft created!${NC}"
    echo -e "${BLUE}Edit the release at: https://github.com/steipete/peekaboo/releases${NC}"
fi

# Step 10: Publish to npm (if requested)
if [ "$PUBLISH_NPM" = true ]; then
    echo -e "\n${BLUE}Publishing to npm...${NC}"
    
    # Confirm before publishing
    echo -e "${YELLOW}About to publish @steipete/peekaboo-mcp@${VERSION} to npm${NC}"
    read -p "Continue? (y/N) " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        npm publish
        echo -e "${GREEN}✅ Published to npm!${NC}"
    else
        echo -e "${YELLOW}Skipped npm publish${NC}"
    fi
fi

echo -e "\n${GREEN}🎉 Release build complete!${NC}"
echo -e "${BLUE}Next steps:${NC}"
echo "1. Review artifacts in: $RELEASE_DIR"
echo "2. Test the binary: tar -xzf $RELEASE_DIR/peekaboo-macos-universal.tar.gz && ./peekaboo-macos-universal/peekaboo --version"
if [ "$CREATE_GITHUB_RELEASE" = false ]; then
    echo "3. Create GitHub release: $0 --create-github-release"
fi
if [ "$PUBLISH_NPM" = false ]; then
    echo "4. Publish to npm: $0 --publish-npm"
fi
echo "5. Update Homebrew formula with new version and SHA256"

[FILE: ../Peekaboo/scripts/install-claude-desktop.sh]
#!/bin/bash
# install-claude-desktop.sh - Install Peekaboo MCP in Claude Desktop

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BINARY_PATH="$PROJECT_ROOT/peekaboo"
CONFIG_DIR="$HOME/Library/Application Support/Claude"
CONFIG_FILE="$CONFIG_DIR/claude_desktop_config.json"

echo -e "${BLUE}🔧 Peekaboo MCP Installer for Claude Desktop${NC}"
echo

# Check if Claude Desktop is installed
if [ ! -d "$CONFIG_DIR" ]; then
    echo -e "${RED}❌ Claude Desktop not found!${NC}"
    echo "Please install Claude Desktop from: https://claude.ai/download"
    exit 1
fi

# Check if Peekaboo binary exists
if [ ! -f "$BINARY_PATH" ]; then
    echo -e "${YELLOW}⚠️  Peekaboo binary not found. Building...${NC}"
    cd "$PROJECT_ROOT"
    npm run build:swift
    
    if [ ! -f "$BINARY_PATH" ]; then
        echo -e "${RED}❌ Build failed!${NC}"
        exit 1
    fi
fi

# Make binary executable
chmod +x "$BINARY_PATH"

# Create config directory if it doesn't exist
mkdir -p "$CONFIG_DIR"

# Backup existing config if it exists
if [ -f "$CONFIG_FILE" ]; then
    BACKUP_FILE="$CONFIG_FILE.backup.$(date +%Y%m%d_%H%M%S)"
    echo -e "${YELLOW}📋 Backing up existing config to: $BACKUP_FILE${NC}"
    cp "$CONFIG_FILE" "$BACKUP_FILE"
fi

# Function to merge JSON configs
merge_config() {
    if [ -f "$CONFIG_FILE" ]; then
        # Use Python to merge configs
        python3 -c "
import json
import sys

# Read existing config
try:
    with open('$CONFIG_FILE', 'r') as f:
        config = json.load(f)
except:
    config = {}

# Ensure mcpServers exists
if 'mcpServers' not in config:
    config['mcpServers'] = {}

# Add or update Peekaboo
config['mcpServers']['peekaboo'] = {
    'command': '$BINARY_PATH',
    'args': ['mcp', 'serve'],
    'env': {
        'PEEKABOO_LOG_LEVEL': 'info'
    }
}

# Write back
with open('$CONFIG_FILE', 'w') as f:
    json.dump(config, f, indent=2)
"
    else
        # Create new config
        cat > "$CONFIG_FILE" << EOF
{
  "mcpServers": {
    "peekaboo": {
      "command": "$BINARY_PATH",
      "args": ["mcp", "serve"],
      "env": {
        "PEEKABOO_LOG_LEVEL": "info"
      }
    }
  }
}
EOF
    fi
}

# Install the configuration
echo -e "${BLUE}📝 Updating Claude Desktop configuration...${NC}"
merge_config

# Check for API keys
echo
echo -e "${BLUE}🔑 Checking API keys...${NC}"

check_api_key() {
    local key_name=$1
    local env_var=$2
    
    if [ -z "${!env_var}" ]; then
        if [ -f "$HOME/.peekaboo/credentials" ] && grep -q "^$env_var=" "$HOME/.peekaboo/credentials"; then
            echo -e "${GREEN}✓ $key_name found in ~/.peekaboo/credentials${NC}"
        else
            echo -e "${YELLOW}⚠️  $key_name not configured${NC}"
            return 1
        fi
    else
        echo -e "${GREEN}✓ $key_name found in environment${NC}"
    fi
    return 0
}

MISSING_KEYS=false
check_api_key "Anthropic API key" "ANTHROPIC_API_KEY" || MISSING_KEYS=true
check_api_key "OpenAI API key" "OPENAI_API_KEY" || true  # Optional
check_api_key "xAI API key" "X_AI_API_KEY" || true  # Optional

if [ "$MISSING_KEYS" = true ]; then
    echo
    echo -e "${YELLOW}To configure API keys, run:${NC}"
    echo "  $BINARY_PATH config set-credential ANTHROPIC_API_KEY sk-ant-..."
fi

# Check permissions
echo
echo -e "${BLUE}🔒 Checking system permissions...${NC}"

check_permission() {
    local service=$1
    local display_name=$2
    
    # This is a simplified check - actual permission checking is complex
    echo -e "${YELLOW}⚠️  Please ensure $display_name permission is granted${NC}"
    echo "   System Settings → Privacy & Security → $display_name"
}

check_permission "com.apple.accessibility" "Accessibility"
check_permission "com.apple.screencapture" "Screen Recording"

# Success message
echo
echo -e "${GREEN}✅ Peekaboo MCP installed successfully!${NC}"
echo
echo -e "${BLUE}Next steps:${NC}"
echo "1. Restart Claude Desktop"
echo "2. Start a new conversation"
echo "3. Try: 'Can you take a screenshot of my desktop?'"
echo
echo -e "${BLUE}Troubleshooting:${NC}"
echo "- Check logs: tail -f ~/Library/Logs/Claude/mcp*.log"
echo "- Monitor Peekaboo: $PROJECT_ROOT/scripts/pblog.sh -f"
echo "- Test manually: $BINARY_PATH mcp serve"
echo
echo -e "${BLUE}Configuration file:${NC} $CONFIG_FILE"

[FILE: ../Peekaboo/scripts/update-homebrew-formula.sh]
#!/bin/bash
set -e

# Script to manually update the Homebrew formula with new version and SHA256

BLUE='\033[0;34m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FORMULA_PATH="$PROJECT_ROOT/homebrew/peekaboo.rb"

if [ "$#" -ne 2 ]; then
    echo "Usage: $0 <version> <sha256>"
    echo "Example: $0 2.0.1 abc123def456..."
    exit 1
fi

VERSION="$1"
SHA256="$2"

echo -e "${BLUE}Updating Homebrew formula...${NC}"
echo "Version: $VERSION"
echo "SHA256: $SHA256"

# Update the formula
sed -i.bak "s|url \".*\"|url \"https://github.com/steipete/peekaboo/releases/download/v${VERSION}/peekaboo-macos-universal.tar.gz\"|" "$FORMULA_PATH"
sed -i.bak "s|sha256 \".*\"|sha256 \"${SHA256}\"|" "$FORMULA_PATH"
sed -i.bak "s|version \".*\"|version \"${VERSION}\"|" "$FORMULA_PATH"

# Remove backup files
rm -f "$FORMULA_PATH.bak"

echo -e "${GREEN}✅ Formula updated!${NC}"
echo -e "${BLUE}Updated formula at: $FORMULA_PATH${NC}"

# Show the diff
echo -e "\n${BLUE}Changes:${NC}"
git diff "$FORMULA_PATH"

echo -e "\n${BLUE}Next steps:${NC}"
echo "1. Review the changes above"
echo "2. Commit: git add homebrew/peekaboo.rb && git commit -m \"Update Homebrew formula to v${VERSION}\""
echo "3. Push to your homebrew-peekaboo tap repository"

[FILE: ../Peekaboo/scripts/test-poltergeist-npm.sh]
#!/bin/bash

# Script to test Poltergeist as if it were installed from npm
# This simulates the final experience before publishing

echo "🧪 Testing Poltergeist npm package simulation..."
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Test each command
echo -e "${BLUE}Testing poltergeist:status...${NC}"
npm run poltergeist:status
echo ""

echo -e "${BLUE}Testing poltergeist:haunt (starting in background)...${NC}"
npm run poltergeist:haunt &
HAUNT_PID=$!
sleep 3

echo -e "${BLUE}Testing poltergeist:status (should show running)...${NC}"
npm run poltergeist:status
echo ""

echo -e "${BLUE}Testing poltergeist:stop...${NC}"
npm run poltergeist:stop
echo ""

echo -e "${BLUE}Testing poltergeist:status (should show stopped)...${NC}"
npm run poltergeist:status
echo ""

echo -e "${GREEN}✅ All tests completed!${NC}"
echo ""
echo "To switch to the real npm package after publishing:"
echo '  "poltergeist:start": "npx @steipete/poltergeist@latest start"'
echo ""
echo "Current setup uses local path which is perfect for testing!"

[FILE: ../Peekaboo/scripts/build-cli-standalone.sh]
#!/bin/bash

# Build the Peekaboo Swift CLI as a standalone binary
# This script builds the CLI independently of the Node.js MCP server

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Building Peekaboo Swift CLI...${NC}"

# Change to the CLI directory
cd "$(dirname "$0")/../Apps/CLI"

# Build for release with optimizations
echo -e "${BLUE}Building release version...${NC}"
swift build -c release

# Get the build output path
BUILD_PATH=".build/release/peekaboo"

if [ -f "$BUILD_PATH" ]; then
    echo -e "${GREEN}✅ Build successful!${NC}"
    echo -e "${BLUE}Binary location: $(pwd)/$BUILD_PATH${NC}"
    
    # Show binary info
    echo -e "\n${BLUE}Binary info:${NC}"
    file "$BUILD_PATH"
    echo "Size: $(du -h "$BUILD_PATH" | cut -f1)"
    
    # Optionally copy to a more convenient location
    if [ "$1" == "--install" ]; then
        echo -e "\n${BLUE}Installing to /usr/local/bin...${NC}"
        sudo cp "$BUILD_PATH" /usr/local/bin/peekaboo
        echo -e "${GREEN}✅ Installed to /usr/local/bin/peekaboo${NC}"
    else
        echo -e "\n${BLUE}To install system-wide, run:${NC}"
        echo "  $0 --install"
        echo -e "\n${BLUE}Or copy manually:${NC}"
        echo "  sudo cp $BUILD_PATH /usr/local/bin/peekaboo"
    fi
    
    echo -e "\n${BLUE}To see usage:${NC}"
    echo "  $BUILD_PATH --help"
else
    echo -e "${RED}❌ Build failed!${NC}"
    exit 1
fi

[FILE: ../Peekaboo/scripts/test-publish.sh]
#!/bin/bash

# Test publishing script for Peekaboo MCP
# This script tests the npm package in a local registry before public release

set -e

echo "🧪 Testing npm package publishing..."
echo ""

# Save current registry
ORIGINAL_REGISTRY=$(npm config get registry)
echo "📦 Original registry: $ORIGINAL_REGISTRY"

# Check if Verdaccio is installed
if ! command -v verdaccio &> /dev/null; then
    echo "❌ Verdaccio not found. Install it with: npm install -g verdaccio"
    exit 1
fi

# Start Verdaccio in background if not already running
if ! curl -s http://localhost:4873/ > /dev/null; then
    echo "🚀 Starting Verdaccio local registry..."
    verdaccio > /tmp/verdaccio.log 2>&1 &
    VERDACCIO_PID=$!
    sleep 3
else
    echo "✅ Verdaccio already running"
fi

# Set to local registry
echo "🔄 Switching to local registry..."
npm set registry http://localhost:4873/

# Create test auth token (Verdaccio accepts any auth on first use)
echo "🔑 Setting up authentication..."
TOKEN=$(echo -n "testuser:testpass" | base64)
npm set //localhost:4873/:_authToken "$TOKEN"

# Build the package
echo "🔨 Building package..."
npm run build:all

# Publish to local registry
echo "📤 Publishing to local registry..."
npm publish --registry http://localhost:4873/

echo ""
echo "✅ Package published to local registry!"
echo ""

# Test installation in a temporary directory
TEMP_DIR=$(mktemp -d)
echo "📥 Testing installation in: $TEMP_DIR"
cd "$TEMP_DIR"

# Initialize a test project
npm init -y > /dev/null 2>&1

# Install the package
echo "📦 Installing @steipete/peekaboo-mcp from local registry..."
npm install @steipete/peekaboo-mcp --registry http://localhost:4873/

# Check if binary exists
if [ -f "node_modules/@steipete/peekaboo-mcp/peekaboo" ]; then
    echo "✅ Binary found in package"
    
    # Test the binary
    echo "🧪 Testing binary..."
    if node_modules/@steipete/peekaboo-mcp/peekaboo --version; then
        echo "✅ Binary works!"
    else
        echo "❌ Binary failed to execute"
    fi
else
    echo "❌ Binary not found in package!"
fi

# Test the MCP server
echo ""
echo "🧪 Testing MCP server..."
cat > test-mcp.js << 'EOF'
const { spawn } = require('child_process');

const server = spawn('npx', ['@steipete/peekaboo-mcp'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

const request = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "tools/list"
}) + '\n';

server.stdin.write(request);

server.stdout.on('data', (data) => {
  const lines = data.toString().split('\n').filter(l => l.trim());
  for (const line of lines) {
    try {
      const response = JSON.parse(line);
      if (response.result && response.result.tools) {
        console.log('✅ MCP server responded with tools:', response.result.tools.map(t => t.name).join(', '));
        server.kill();
        process.exit(0);
      }
    } catch (e) {
      // Ignore non-JSON lines
    }
  }
});

setTimeout(() => {
  console.error('❌ Timeout waiting for MCP server response');
  server.kill();
  process.exit(1);
}, 5000);
EOF

if node test-mcp.js; then
    echo "✅ MCP server test passed!"
else
    echo "❌ MCP server test failed"
fi

# Cleanup
cd - > /dev/null
rm -rf "$TEMP_DIR"

# Restore original registry
echo ""
echo "🔄 Restoring original registry..."
npm set registry "$ORIGINAL_REGISTRY"
npm config delete //localhost:4873/:_authToken

# Kill Verdaccio if we started it
if [ ! -z "$VERDACCIO_PID" ]; then
    echo "🛑 Stopping Verdaccio..."
    kill $VERDACCIO_PID 2>/dev/null || true
fi

echo ""
echo "✨ Test publish complete!"
echo ""
echo "📋 Next steps:"
echo "1. If all tests passed, you can publish to npm with: npm publish"
echo "2. Remember to tag appropriately if beta: npm publish --tag beta"
echo "3. Create a GitHub release after publishing"

[FILE: ../Peekaboo/scripts/docs-list.mjs]
#!/usr/bin/env node

/**
 * Lists documentation summaries so agents can see what to read before coding.
 * The format mirrors the helper from steipete/agent-scripts but tolerates
 * legacy files that lack front matter by falling back to the first heading.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DOCS_DIR = join(__dirname, '..', 'docs');

const EXCLUDED_DIRS = new Set(['archive', 'research']);

function walkMarkdownFiles(dir, base = dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) {
        continue;
      }
      files.push(...walkMarkdownFiles(fullPath, base));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      files.push(relative(base, fullPath));
    }
  }

  return files.sort((a, b) => a.localeCompare(b));
}

function extractMetadata(fullPath) {
  const content = readFileSync(fullPath, 'utf8');
  const issues = [];
  const readWhen = [];

  if (!content.startsWith('---')) {
    const summary = deriveHeadingSummary(content) ?? '(add summary front matter)';
    issues.push('front matter missing');
    return { summary, readWhen, issues };
  }

  const endIndex = content.indexOf('\n---', 3);
  if (endIndex === -1) {
    const summary = deriveHeadingSummary(content) ?? '(front matter incomplete)';
    issues.push('unterminated front matter');
    return { summary, readWhen, issues };
  }

  const frontMatter = content.slice(3, endIndex).trim();
  const lines = frontMatter.split('\n');

  let summaryLine = null;
  let collectingReadWhen = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith('summary:')) {
      summaryLine = line.slice('summary:'.length).trim();
      collectingReadWhen = false;
      continue;
    }
    if (line.startsWith('read_when:')) {
      collectingReadWhen = true;
      const inline = line.slice('read_when:'.length).trim();
      if (inline.startsWith('[') && inline.endsWith(']')) {
        collectingReadWhen = false;
        try {
          const parsed = JSON.parse(inline.replace(/'/g, '"'));
          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              if (typeof item === 'string' && item.trim().length > 0) {
                readWhen.push(item.trim());
              }
            }
          }
        } catch {
          issues.push('read_when inline array malformed');
        }
      }
      continue;
    }

    if (collectingReadWhen) {
      if (line.startsWith('- ')) {
        const hint = line.slice(2).trim();
        if (hint.length > 0) {
          readWhen.push(hint);
        }
      } else if (line.length === 0) {
        continue;
      } else {
        collectingReadWhen = false;
      }
    }
  }

  if (!summaryLine) {
    issues.push('summary key missing');
  }

  const summaryValue = normalizeSummary(summaryLine);
  if (!summaryValue) {
    issues.push('summary is empty');
  }

  const summary =
    summaryValue ?? deriveHeadingSummary(content.slice(endIndex + 4)) ?? '(add summary front matter)';

  return { summary, readWhen, issues };
}

function normalizeSummary(value) {
  if (!value) return null;
  const trimmed = value.replace(/^['"]|['"]$/g, '').replace(/\s+/g, ' ').trim();
  return trimmed.length > 0 ? trimmed : null;
}

function deriveHeadingSummary(content) {
  const lines = content.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith('#')) {
      const heading = line.replace(/^#+\s*/, '').trim();
      if (heading.length > 0) {
        return heading;
      }
    }
    if (line.length > 0) {
      // Bail once we hit real content to avoid scanning entire file.
      break;
    }
  }
  return null;
}

console.log('Listing documentation summaries (docs/):\n');

const markdownFiles = walkMarkdownFiles(DOCS_DIR);

for (const relativePath of markdownFiles) {
  const fullPath = join(DOCS_DIR, relativePath);
  const { summary, readWhen, issues } = extractMetadata(fullPath);
  const suffix = issues.length > 0 ? ` [${issues.join(', ')}]` : '';
  console.log(`${relativePath} - ${summary}${suffix}`);
  if (readWhen.length > 0) {
    console.log(`  Read when: ${readWhen.join('; ')}`);
  }
}

console.log('\nIf a doc is missing front matter, add:');
console.log('---');
console.log("summary: 'Short imperative summary'");
console.log('read_when:');
console.log('  - condition 1');
console.log('  - condition 2');
console.log('---');
console.log('before the first heading so the helper can surface it contextually.');

[FILE: ../Peekaboo/scripts/build-swift-arm.sh]
#!/bin/bash
set -e # Exit immediately if a command exits with a non-zero status.

PROJECT_ROOT=$(cd "$(dirname "$0")/.." && pwd)
SWIFT_PROJECT_PATH="$PROJECT_ROOT/Apps/CLI"
FINAL_BINARY_NAME="peekaboo"
FINAL_BINARY_PATH="$PROJECT_ROOT/$FINAL_BINARY_NAME"

# Swift compiler flags for size optimization
# -Osize: Optimize for binary size.
# -wmo: Whole Module Optimization, allows more aggressive optimizations.
# -Xlinker -dead_strip: Remove dead code at the linking stage.
SWIFT_OPTIMIZATION_FLAGS="-Xswiftc -Osize -Xswiftc -wmo -Xlinker -dead_strip"

echo "🧹 Cleaning previous build artifacts..."
(cd "$SWIFT_PROJECT_PATH" && swift package reset) || echo "'swift package reset' encountered an issue, attempting rm -rf..."
rm -rf "$SWIFT_PROJECT_PATH/.build"
rm -f "$FINAL_BINARY_PATH.tmp"

echo "📦 Reading version from version.json..."
VERSION=$(node -p "require('$PROJECT_ROOT/version.json').version")
echo "Version: $VERSION"

echo "💉 Injecting version into Swift code..."
VERSION_SWIFT_PATH="$SWIFT_PROJECT_PATH/Sources/peekaboo/Version.swift"

# Get git information
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
GIT_COMMIT_DATE=$(git show -s --format=%ci HEAD 2>/dev/null || echo "unknown")
GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
GIT_DIRTY=$(git diff --quiet && git diff --cached --quiet || echo "-dirty")
BUILD_DATE=$(date -Iseconds)

cat > "$VERSION_SWIFT_PATH" << EOF
// This file is auto-generated by the build script. Do not edit manually.
enum Version {
    static let current = "Peekaboo $VERSION"
    static let gitCommit = "$GIT_COMMIT$GIT_DIRTY"
    static let gitCommitDate = "$GIT_COMMIT_DATE"
    static let gitBranch = "$GIT_BRANCH"
    static let buildDate = "$BUILD_DATE"
    
    static var fullVersion: String {
        return "\(current) (\(gitBranch)/\(gitCommit), built: \(buildDate))"
    }
}
EOF

echo "🏗️ Building for arm64 (Apple Silicon) only..."
(cd "$SWIFT_PROJECT_PATH" && swift build --arch arm64 -c release $SWIFT_OPTIMIZATION_FLAGS)
cp "$SWIFT_PROJECT_PATH/.build/arm64-apple-macosx/release/$FINAL_BINARY_NAME" "$FINAL_BINARY_PATH.tmp"
echo "✅ arm64 build complete"

echo "🤏 Stripping symbols for further size reduction..."
# -S: Remove debugging symbols
# -x: Remove non-global symbols
# -u: Save symbols of undefined references
# Note: LC_UUID is preserved by not using -no_uuid during linking
strip -Sxu "$FINAL_BINARY_PATH.tmp"

echo "🔏 Code signing the binary..."
ENTITLEMENTS_PATH="$SWIFT_PROJECT_PATH/Sources/Resources/peekaboo.entitlements"
if security find-identity -p codesigning -v | grep -q "Developer ID Application"; then
    # Sign with Developer ID if available
    SIGNING_IDENTITY=$(security find-identity -p codesigning -v | grep "Developer ID Application" | head -1 | awk '{print $2}')
    codesign --force --sign "$SIGNING_IDENTITY" \
        --options runtime \
        --identifier "boo.peekaboo" \
        --entitlements "$ENTITLEMENTS_PATH" \
        --timestamp \
        "$FINAL_BINARY_PATH.tmp"
    echo "✅ Signed with Developer ID: $SIGNING_IDENTITY"
else
    # Fall back to ad-hoc signing for local builds
    codesign --force --sign - \
        --identifier "boo.peekaboo" \
        --entitlements "$ENTITLEMENTS_PATH" \
        "$FINAL_BINARY_PATH.tmp"
    echo "⚠️  Ad-hoc signed (no Developer ID found)"
fi

# Verify the signature and embedded info
echo "🔍 Verifying code signature..."
codesign -dv "$FINAL_BINARY_PATH.tmp" 2>&1 | grep -E "Identifier=|Signature"

# Replace the old binary with the new one
mv "$FINAL_BINARY_PATH.tmp" "$FINAL_BINARY_PATH"

echo "🔍 Verifying final binary..."
lipo -info "$FINAL_BINARY_PATH"
ls -lh "$FINAL_BINARY_PATH"

echo "🎉 ARM64 binary '$FINAL_BINARY_PATH' created and optimized successfully!"

[FILE: ../Peekaboo/scripts/playground-log.sh]
#!/bin/bash

# Wrapper script for Playground logging utility
# This allows running playground-log.sh from the project root

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLAYGROUND_LOG="$SCRIPT_DIR/../Playground/scripts/playground-log.sh"

if [[ ! -f "$PLAYGROUND_LOG" ]]; then
    echo "Error: Playground log script not found at $PLAYGROUND_LOG" >&2
    echo "Make sure the Playground app is built and the script exists." >&2
    exit 1
fi

# Forward all arguments to the actual script
exec "$PLAYGROUND_LOG" "$@"

[FILE: ../Peekaboo/scripts/build-swift-debug.sh]
#!/bin/bash
set -e

PROJECT_ROOT=$(cd "$(dirname "$0")/.." && pwd)
SWIFT_PROJECT_PATH="$PROJECT_ROOT/Apps/CLI"

# Parse arguments
CLEAN_BUILD=false
if [[ "$1" == "--clean" ]]; then
    CLEAN_BUILD=true
fi

# Only clean if requested
if [[ "$CLEAN_BUILD" == "true" ]]; then
    echo "🧹 Cleaning previous build artifacts..."
    rm -rf "$SWIFT_PROJECT_PATH/.build"
    (cd "$SWIFT_PROJECT_PATH" && swift package reset 2>/dev/null || true)
fi

echo "📦 Reading version from version.json..."
VERSION=$(node -p "require('$PROJECT_ROOT/version.json').version" 2>/dev/null || echo "3.0.0-dev")

echo "💉 Injecting version into Swift code..."
VERSION_SWIFT_PATH="$SWIFT_PROJECT_PATH/Sources/PeekabooCLI/Version.swift"
if [[ ! -f "$VERSION_SWIFT_PATH" ]]; then
    VERSION_SWIFT_PATH="$SWIFT_PROJECT_PATH/Sources/peekaboo/Version.swift"
fi

# Get git information
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
GIT_COMMIT_DATE=$(git show -s --format=%ci HEAD 2>/dev/null || echo "unknown")
GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
GIT_DIRTY=$(git diff --quiet && git diff --cached --quiet || echo "-dirty")
BUILD_DATE=$(date -Iseconds)

# Check if Version.swift exists and has the same git commit
NEEDS_UPDATE=true
if [[ -f "$VERSION_SWIFT_PATH" ]]; then
    EXISTING_COMMIT=$(grep "gitCommit = " "$VERSION_SWIFT_PATH" 2>/dev/null | sed 's/.*gitCommit = "\(.*\)".*/\1/' || echo "")
    if [[ "$EXISTING_COMMIT" == "$GIT_COMMIT$GIT_DIRTY" ]]; then
        # Same commit, preserve existing build date to avoid triggering rebuilds
        BUILD_DATE=$(grep "buildDate = " "$VERSION_SWIFT_PATH" 2>/dev/null | sed 's/.*buildDate = "\(.*\)".*/\1/' || echo "$BUILD_DATE")
        NEEDS_UPDATE=false
    fi
fi

# Only update if git commit changed or file doesn't exist
if [[ "$NEEDS_UPDATE" == "true" || ! -f "$VERSION_SWIFT_PATH" ]]; then
    cat > "$VERSION_SWIFT_PATH" << EOF
// This file is auto-generated by the build script. Do not edit manually.
enum Version {
    static let current = "Peekaboo $VERSION"
    static let gitCommit = "$GIT_COMMIT$GIT_DIRTY"
    static let gitCommitDate = "$GIT_COMMIT_DATE"
    static let gitBranch = "$GIT_BRANCH"
    static let buildDate = "$BUILD_DATE"
    
    static var fullVersion: String {
        return "\(current) (\(gitBranch)/\(gitCommit), built: \(buildDate))"
    }
}
EOF
else
    echo "   Version.swift is up-to-date (commit: $GIT_COMMIT$GIT_DIRTY)"
fi

if [[ "$CLEAN_BUILD" == "true" ]]; then
    echo "🏗️ Building for debug (clean build)..."
else
    echo "🏗️ Building for debug (incremental)..."
fi

(cd "$SWIFT_PROJECT_PATH" && swift build)

echo "🔏 Code signing the debug binary..."
PROJECT_NAME="peekaboo"
DEBUG_BINARY_PATH="$SWIFT_PROJECT_PATH/.build/debug/$PROJECT_NAME"
ENTITLEMENTS_PATH="$SWIFT_PROJECT_PATH/Sources/Resources/peekaboo.entitlements"

if [[ -f "$ENTITLEMENTS_PATH" ]]; then
    codesign --force --sign - \
        --identifier "boo.peekaboo" \
        --entitlements "$ENTITLEMENTS_PATH" \
        "$DEBUG_BINARY_PATH"
    echo "✅ Debug binary signed with entitlements"
else
    echo "⚠️  Entitlements file not found, signing without entitlements"
    codesign --force --sign - \
        --identifier "boo.peekaboo" \
        "$DEBUG_BINARY_PATH"
fi

echo "📦 Copying binary to project root..."
cp "$DEBUG_BINARY_PATH" "$PROJECT_ROOT/peekaboo"
echo "✅ Debug build complete"

[FILE: ../Peekaboo/scripts/playwright-server]
#!/usr/bin/env sh
# Direct binary runner for Chrome DevTools MCP
exec /Users/steipete/.nvm/versions/node/v24.4.1/bin/node /Users/steipete/.nvm/versions/node/v24.4.1/lib/node_modules/chrome-devtools-mcp/build/src/index.js "$@"

[FILE: ../Peekaboo/scripts/pblog.sh]
#!/bin/bash

# Default values
LINES=50
TIME="5m"
LEVEL="info"
CATEGORY=""
SEARCH=""
OUTPUT=""
DEBUG=false
FOLLOW=false
ERRORS_ONLY=false
NO_TAIL=false
JSON=false
SUBSYSTEM=""
PRIVATE=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -n|--lines)
            LINES="$2"
            shift 2
            ;;
        -l|--last)
            TIME="$2"
            shift 2
            ;;
        -c|--category)
            CATEGORY="$2"
            shift 2
            ;;
        -s|--search)
            SEARCH="$2"
            shift 2
            ;;
        -o|--output)
            OUTPUT="$2"
            shift 2
            ;;
        -d|--debug)
            DEBUG=true
            LEVEL="debug"
            shift
            ;;
        -f|--follow)
            FOLLOW=true
            shift
            ;;
        -e|--errors)
            ERRORS_ONLY=true
            LEVEL="error"
            shift
            ;;
        -p|--private)
            PRIVATE=true
            shift
            ;;
        --all)
            NO_TAIL=true
            shift
            ;;
        --json)
            JSON=true
            shift
            ;;
        --subsystem)
            SUBSYSTEM="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: pblog.sh [options]"
            echo ""
            echo "Options:"
            echo "  -n, --lines NUM      Number of lines to show (default: 50)"
            echo "  -l, --last TIME      Time range to search (default: 5m)"
            echo "  -c, --category CAT   Filter by category"
            echo "  -s, --search TEXT    Search for specific text"
            echo "  -o, --output FILE    Output to file"
            echo "  -d, --debug          Show debug level logs"
            echo "  -f, --follow         Stream logs continuously"
            echo "  -e, --errors         Show only errors"
            echo "  -p, --private        Show private data (requires passwordless sudo)"
            echo "  --all                Show all logs without tail limit"
            echo "  --json               Output in JSON format"
            echo "  --subsystem NAME     Filter by subsystem (default: all Peekaboo subsystems)"
            echo "  -h, --help           Show this help"
            echo ""
            echo "Peekaboo subsystems:"
            echo "  boo.peekaboo.core       - Core services"
            echo "  boo.peekaboo.cli        - CLI tool"
            echo "  boo.peekaboo.inspector  - Inspector app"
            echo "  boo.peekaboo.playground - Playground app"
            echo "  boo.peekaboo.app        - Mac app"
            echo "  boo.peekaboo            - Mac app components"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Build predicate - either specific subsystem or all Peekaboo subsystems
if [[ -n "$SUBSYSTEM" ]]; then
    PREDICATE="subsystem == \"$SUBSYSTEM\""
else
    # Match all Peekaboo-related subsystems
    PREDICATE="(subsystem == \"boo.peekaboo.core\" OR subsystem == \"boo.peekaboo.inspector\" OR subsystem == \"boo.peekaboo.playground\" OR subsystem == \"boo.peekaboo.app\" OR subsystem == \"boo.peekaboo\" OR subsystem == \"boo.peekaboo.axorcist\" OR subsystem == \"boo.peekaboo.cli\")"
fi

if [[ -n "$CATEGORY" ]]; then
    PREDICATE="$PREDICATE AND category == \"$CATEGORY\""
fi

if [[ -n "$SEARCH" ]]; then
    PREDICATE="$PREDICATE AND eventMessage CONTAINS[c] \"$SEARCH\""
fi

# Build command
# Add sudo prefix if private flag is set
SUDO_PREFIX=""
if [[ "$PRIVATE" == true ]]; then
    SUDO_PREFIX="sudo -n "
fi

if [[ "$FOLLOW" == true ]]; then
    CMD="${SUDO_PREFIX}log stream --predicate '$PREDICATE' --level $LEVEL"
else
    # log show uses different flags for log levels
    case $LEVEL in
        debug)
            CMD="${SUDO_PREFIX}log show --predicate '$PREDICATE' --debug --last $TIME"
            ;;
        error)
            # For errors, we need to filter by eventType in the predicate
            PREDICATE="$PREDICATE AND eventType == \"error\""
            CMD="${SUDO_PREFIX}log show --predicate '$PREDICATE' --info --debug --last $TIME"
            ;;
        *)
            CMD="${SUDO_PREFIX}log show --predicate '$PREDICATE' --info --last $TIME"
            ;;
    esac
fi

if [[ "$JSON" == true ]]; then
    CMD="$CMD --style json"
fi

# Execute command
if [[ -n "$OUTPUT" ]]; then
    if [[ "$NO_TAIL" == true ]]; then
        eval $CMD > "$OUTPUT"
    else
        eval $CMD | tail -n $LINES > "$OUTPUT"
    fi
else
    if [[ "$NO_TAIL" == true ]]; then
        eval $CMD
    else
        eval $CMD | tail -n $LINES
    fi
fi

[FILE: ../Peekaboo/scripts/build-swift-universal.sh]
#!/bin/bash
set -e # Exit immediately if a command exits with a non-zero status.

PROJECT_ROOT=$(cd "$(dirname "$0")/.." && pwd)
SWIFT_PROJECT_PATH="$PROJECT_ROOT/Apps/CLI"
FINAL_BINARY_NAME="peekaboo"
FINAL_BINARY_PATH="$PROJECT_ROOT/$FINAL_BINARY_NAME"

ARM64_BINARY_TEMP="$PROJECT_ROOT/${FINAL_BINARY_NAME}-arm64"
X86_64_BINARY_TEMP="$PROJECT_ROOT/${FINAL_BINARY_NAME}-x86_64"

# Swift compiler flags for size optimization
# -Osize: Optimize for binary size.
# -wmo: Whole Module Optimization, allows more aggressive optimizations.
# -Xlinker -dead_strip: Remove dead code at the linking stage.
SWIFT_OPTIMIZATION_FLAGS="-Xswiftc -Osize -Xswiftc -wmo -Xlinker -dead_strip"

echo "🧹 Cleaning previous build artifacts..."
(cd "$SWIFT_PROJECT_PATH" && swift package reset) || echo "'swift package reset' encountered an issue, attempting rm -rf..."
rm -rf "$SWIFT_PROJECT_PATH/.build"
rm -f "$ARM64_BINARY_TEMP" "$X86_64_BINARY_TEMP" "$FINAL_BINARY_PATH.tmp"

echo "📦 Reading version from version.json..."
VERSION=$(node -p "require('$PROJECT_ROOT/version.json').version")
echo "Version: $VERSION"

echo "💉 Injecting version into Swift code..."
VERSION_SWIFT_PATH="$SWIFT_PROJECT_PATH/Sources/peekaboo/Version.swift"

# Get git information
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
GIT_COMMIT_DATE=$(git show -s --format=%ci HEAD 2>/dev/null || echo "unknown")
GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
GIT_DIRTY=$(git diff --quiet && git diff --cached --quiet || echo "-dirty")
BUILD_DATE=$(date -Iseconds)

cat > "$VERSION_SWIFT_PATH" << EOF
// This file is auto-generated by the build script. Do not edit manually.
enum Version {
    static let current = "Peekaboo $VERSION"
    static let gitCommit = "$GIT_COMMIT$GIT_DIRTY"
    static let gitCommitDate = "$GIT_COMMIT_DATE"
    static let gitBranch = "$GIT_BRANCH"
    static let buildDate = "$BUILD_DATE"
    
    static var fullVersion: String {
        return "\(current) (\(gitBranch)/\(gitCommit), built: \(buildDate))"
    }
}
EOF

echo "🏗️ Building for arm64 (Apple Silicon)..."
(cd "$SWIFT_PROJECT_PATH" && swift build --arch arm64 -c release $SWIFT_OPTIMIZATION_FLAGS)
cp "$SWIFT_PROJECT_PATH/.build/arm64-apple-macosx/release/$FINAL_BINARY_NAME" "$ARM64_BINARY_TEMP"
echo "✅ arm64 build complete: $ARM64_BINARY_TEMP"

echo "🏗️ Building for x86_64 (Intel)..."
(cd "$SWIFT_PROJECT_PATH" && swift build --arch x86_64 -c release $SWIFT_OPTIMIZATION_FLAGS)
cp "$SWIFT_PROJECT_PATH/.build/x86_64-apple-macosx/release/$FINAL_BINARY_NAME" "$X86_64_BINARY_TEMP"
echo "✅ x86_64 build complete: $X86_64_BINARY_TEMP"

echo "🔗 Creating universal binary..."
lipo -create -output "$FINAL_BINARY_PATH.tmp" "$ARM64_BINARY_TEMP" "$X86_64_BINARY_TEMP"

echo "🤏 Stripping symbols for further size reduction..."
# -S: Remove debugging symbols
# -x: Remove non-global symbols
# -u: Save symbols of undefined references
# Note: LC_UUID is preserved by not using -no_uuid during linking
strip -Sxu "$FINAL_BINARY_PATH.tmp"

echo "🔏 Code signing the universal binary..."
ENTITLEMENTS_PATH="$SWIFT_PROJECT_PATH/Sources/Resources/peekaboo.entitlements"
if security find-identity -p codesigning -v | grep -q "Developer ID Application"; then
    # Sign with Developer ID if available
    SIGNING_IDENTITY=$(security find-identity -p codesigning -v | grep "Developer ID Application" | head -1 | awk '{print $2}')
    codesign --force --sign "$SIGNING_IDENTITY" \
        --options runtime \
        --identifier "boo.peekaboo" \
        --entitlements "$ENTITLEMENTS_PATH" \
        --timestamp \
        "$FINAL_BINARY_PATH.tmp"
    echo "✅ Signed with Developer ID: $SIGNING_IDENTITY"
else
    # Fall back to ad-hoc signing for local builds
    codesign --force --sign - \
        --identifier "boo.peekaboo" \
        --entitlements "$ENTITLEMENTS_PATH" \
        "$FINAL_BINARY_PATH.tmp"
    echo "⚠️  Ad-hoc signed (no Developer ID found)"
fi

# Verify the signature and embedded info
echo "🔍 Verifying code signature..."
codesign -dv "$FINAL_BINARY_PATH.tmp" 2>&1 | grep -E "Identifier=|Signature"

# Replace the old binary with the new one
mv "$FINAL_BINARY_PATH.tmp" "$FINAL_BINARY_PATH"

echo "🗑️ Cleaning up temporary architecture-specific binaries..."
rm -f "$ARM64_BINARY_TEMP" "$X86_64_BINARY_TEMP"

echo "🔍 Verifying final universal binary..."
lipo -info "$FINAL_BINARY_PATH"
ls -lh "$FINAL_BINARY_PATH"

echo "🎉 Universal binary '$FINAL_BINARY_PATH' created and optimized successfully!"

[FILE: ../Peekaboo/scripts/peekaboo-logs.sh]
#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: scripts/peekaboo-logs.sh [options] [-- additional log(1) args]

Fetch unified logging output for Peekaboo subsystems with sensible defaults.
If no options are supplied it shows the last 5 minutes from the core, mac, and visualizer subsystems.

Options:
  --last <duration>      Duration for `log show --last` (default: 5m)
  --since <timestamp>    Start timestamp for `log show --start`
  --stream               Use `log stream` instead of `log show`
  --subsystem <name>     Add another subsystem to the predicate (repeatable)
  --predicate <expr>     Override the predicate entirely
  --style <style>        Set `log` style (default: compact)
  -h, --help             Show this message
USAGE
}

last_duration="5m"
start_time=""
use_stream=false
style="compact"
custom_predicate=""
subsystems=("boo.peekaboo.core" "boo.peekaboo.mac" "boo.peekaboo.visualizer")
extra_args=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --last)
      last_duration="$2"
      shift 2
      ;;
    --since)
      start_time="$2"
      shift 2
      ;;
    --stream)
      use_stream=true
      shift
      ;;
    --subsystem)
      subsystems+=("$2")
      shift 2
      ;;
    --predicate)
      custom_predicate="$2"
      shift 2
      ;;
    --style)
      style="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      extra_args+=("$@")
      break
      ;;
    -*)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
    *)
      extra_args+=("$1")
      shift
      ;;
  esac
done

if [[ -n "$custom_predicate" ]]; then
  predicate="$custom_predicate"
else
  predicate_parts=()
  for subsystem in "${subsystems[@]}"; do
    predicate_parts+=("subsystem == \"${subsystem}\"")
  done
  predicate="${predicate_parts[0]}"
  for part in "${predicate_parts[@]:1}"; do
    predicate+=" OR ${part}"
  done
fi

log_cmd=(log)
if $use_stream; then
  log_cmd+=(stream)
else
  log_cmd+=(show)
  if [[ -n "$start_time" ]]; then
    log_cmd+=(--start "$start_time")
  else
    log_cmd+=(--last "$last_duration")
  fi
fi

log_cmd+=(--style "$style" --predicate "$predicate")
if ((${#extra_args[@]} > 0)); then
  log_cmd+=("${extra_args[@]}")
fi

exec "${log_cmd[@]}"

[FILE: ../Peekaboo/scripts/poltergeist-debug.sh]
#!/bin/bash

# Debug wrapper for Poltergeist

set -x  # Enable debug output

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"

echo "Script dir: $SCRIPT_DIR"
echo "Project dir: $PROJECT_DIR"
echo "Current dir: $(pwd)"

cd "$PROJECT_DIR"

echo "Changed to: $(pwd)"
echo "Config file exists: $(test -f poltergeist.config.json && echo YES || echo NO)"
echo "Running: node ../poltergeist/dist/cli.js $@"

exec node ../poltergeist/dist/cli.js "$@"

[FILE: ../Peekaboo/scripts/menu-dialog-soak.sh]
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${MENU_DIALOG_SOAK_LOG_DIR:-/tmp/menu-dialog-soak}"
BUILD_PATH="${MENU_DIALOG_SOAK_BUILD_PATH:-/tmp/menu-dialog-soak.build}"
EXIT_PATH="${MENU_DIALOG_SOAK_EXIT_PATH:-$LOG_DIR/last-exit.code}"
ITERATIONS="${MENU_DIALOG_SOAK_ITERATIONS:-1}"
TEST_FILTER="${MENU_DIALOG_SOAK_FILTER:-MenuDialogLocalHarnessTests/menuStressLoop}"

mkdir -p "$LOG_DIR"

write_exit_code() {
  local status=${1:-$?}
  mkdir -p "$(dirname "$EXIT_PATH")"
  printf "%s" "$status" > "$EXIT_PATH"
}
trap 'write_exit_code $?' EXIT

run_iteration() {
  local iteration="$1"
  local timestamp
  timestamp="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  local log_path="$LOG_DIR/iteration-${iteration}.log"
  echo "[${timestamp}] Starting soak iteration ${iteration}/${ITERATIONS}" | tee "$log_path"

  (
    cd "$ROOT_DIR"
    RUN_LOCAL_TESTS="${RUN_LOCAL_TESTS:-true}" swift test \
      --package-path Apps/CLI \
      --build-path "$BUILD_PATH" \
      --filter "$TEST_FILTER"
  ) 2>&1 | tee -a "$log_path"

  local status=${PIPESTATUS[0]}
  timestamp="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  if [[ "$status" -eq 0 ]]; then
    echo "[${timestamp}] Iteration ${iteration} completed successfully" | tee -a "$log_path"
  else
    echo "[${timestamp}] Iteration ${iteration} failed with status ${status}" | tee -a "$log_path"
  fi
  return "$status"
}

for ((i = 1; i <= ITERATIONS; i++)); do
  if ! run_iteration "$i"; then
    exit 1
  fi

  # Surface progress at least once per minute even if more runs remain.
  if [[ "$i" -lt "$ITERATIONS" ]]; then
    echo "[info] Completed iteration ${i}; sleeping 5s before next soak pass."
    sleep 5
  fi
done

[FILE: ../Peekaboo/scripts/verify-poltergeist-config.js]
#!/usr/bin/env node
// Script to verify Peekaboo's config is ready for new Poltergeist

const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying Peekaboo config for new Poltergeist...\n');

// Read the config
const configPath = path.join(__dirname, '..', 'poltergeist.config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Check for new format
if ('cli' in config || 'macApp' in config) {
  console.error('❌ ERROR: Config still uses old format!');
  console.error('   Found "cli" or "macApp" sections');
  process.exit(1);
}

if (!config.targets || !Array.isArray(config.targets)) {
  console.error('❌ ERROR: Config missing "targets" array!');
  process.exit(1);
}

console.log('✅ Config uses new format with targets array');
console.log(`✅ Found ${config.targets.length} targets:\n`);

// Validate each target
let hasErrors = false;
config.targets.forEach((target, index) => {
  console.log(`Target ${index + 1}: ${target.name}`);
  
  // Check required fields
  const required = ['name', 'type', 'buildCommand', 'watchPaths'];
  const missing = required.filter(field => !target[field]);
  
  if (missing.length > 0) {
    console.error(`  ❌ Missing required fields: ${missing.join(', ')}`);
    hasErrors = true;
  } else {
    console.log(`  ✅ Type: ${target.type}`);
    console.log(`  ✅ Enabled: ${target.enabled}`);
    console.log(`  ✅ Build: ${target.buildCommand}`);
    console.log(`  ✅ Watch: ${target.watchPaths.length} patterns`);
  }
  
  // Type-specific validation
  if (target.type === 'executable' && !target.outputPath) {
    console.error('  ❌ Executable target missing outputPath');
    hasErrors = true;
  }
  
  if (target.type === 'app-bundle' && !target.bundleId) {
    console.error('  ❌ App bundle target missing bundleId');
    hasErrors = true;
  }
  
  console.log('');
});

// Check optional sections
if (config.notifications) {
  console.log('✅ Notifications configured');
}

if (config.logging) {
  console.log('✅ Logging configured');
}

if (hasErrors) {
  console.error('\n❌ Config validation failed!');
  process.exit(1);
} else {
  console.log('\n✅ Config is ready for new Poltergeist!');
  console.log('\nExample commands with new Poltergeist:');
  console.log('  poltergeist haunt --target peekaboo-cli');
  console.log('  poltergeist haunt --target peekaboo-mac');
  console.log('  poltergeist haunt  # builds all enabled targets');
  console.log('  poltergeist list   # shows all configured targets');
}

[FILE: ../Peekaboo/scripts/committer]
#!/usr/bin/env bash

set -euo pipefail
# Disable glob expansion to handle brackets in file paths
set -f
usage() {
  printf 'Usage: %s "commit message" "file" ["file" ...]\n' "$(basename "$0")" >&2
  exit 2
}

if [ "$#" -lt 2 ]; then
  usage
fi

commit_message=$1
shift

if [[ "$commit_message" != *[![:space:]]* ]]; then
  printf 'Error: commit message must not be empty\n' >&2
  exit 1
fi

if [ -e "$commit_message" ]; then
  printf 'Error: first argument looks like a file path ("%s"); provide the commit message first\n' "$commit_message" >&2
  exit 1
fi

if [ "$#" -eq 0 ]; then
  usage
fi

files=("$@")

for file in "${files[@]}"; do
  if [ ! -e "$file" ]; then
    if ! git ls-files --error-unmatch -- "$file" >/dev/null 2>&1; then
      printf 'Error: file not found: %s\n' "$file" >&2
      exit 1
    fi
  fi
done

git restore --staged :/
git add --force -- "${files[@]}"

if git diff --staged --quiet; then
  printf 'Warning: no staged changes detected for: %s\n' "${files[*]}" >&2
  exit 1
fi

git commit -m "$commit_message" -- "${files[@]}"

printf 'Committed "%s" with %d files\n' "$commit_message" "${#files[@]}"

[FILE: ../Peekaboo/scripts/visualizer-logs.sh]
#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: scripts/visualizer-logs.sh [--stream] [--last <duration>] [--predicate <predicate>]

Options:
  --stream               Stream logs live (uses `log stream`). Default shows history via `log show`.
  --last <duration>      Duration passed to `log show --last` (default: 10m). Ignored with --stream.
  --predicate <expr>     Override the default unified logging predicate.
  -h, --help             Display this help message.

The default predicate captures all VisualizationClient/VisualizerEventReceiver traffic
on the `boo.peekaboo.core` and `boo.peekaboo.mac` subsystems.
USAGE
}

MODE="show"
LAST="10m"
PREDICATE='(subsystem == "boo.peekaboo.core" && category CONTAINS "Visualization") || (subsystem == "boo.peekaboo.mac" && category CONTAINS "Visualizer")'

while [[ $# -gt 0 ]]; do
  case "$1" in
    --stream)
      MODE="stream"
      shift
      ;;
    --last)
      [[ $# -ge 2 ]] || { echo "--last requires a duration" >&2; exit 1; }
      LAST="$2"
      shift 2
      ;;
    --predicate)
      [[ $# -ge 2 ]] || { echo "--predicate requires an expression" >&2; exit 1; }
      PREDICATE="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ "$MODE" == "stream" ]]; then
  log stream --style compact --predicate "$PREDICATE"
else
  log show --style compact --last "$LAST" --predicate "$PREDICATE"
fi

[FILE: ../Peekaboo/scripts/test-package.sh]
#!/bin/bash

# Simple package test script for Peekaboo MCP
# Tests the package locally without publishing

set -e

echo "🧪 Testing npm package locally..."
echo ""

# Build everything
echo "🔨 Building package..."
npm run build:swift:all

# Create package
echo "📦 Creating package tarball..."
PACKAGE_FILE=$(npm pack | tail -n 1)
PACKAGE_PATH=$(pwd)/$PACKAGE_FILE
echo "Created: $PACKAGE_FILE"

# Get package info
PACKAGE_SIZE=$(du -h "$PACKAGE_FILE" | cut -f1)
echo "Package size: $PACKAGE_SIZE"

# Test installation in a temporary directory
TEMP_DIR=$(mktemp -d)
echo ""
echo "📥 Testing installation in: $TEMP_DIR"
cd "$TEMP_DIR"

# Initialize a test project
npm init -y > /dev/null 2>&1

# Install the package from tarball
echo "📦 Installing from tarball..."
npm install "$PACKAGE_PATH"

# Check installation
echo ""
echo "🔍 Checking installation..."

# Check if binary exists and is executable
if [ -f "node_modules/peekaboo/peekaboo" ]; then
    echo "✅ Binary found"
    
    # Check if executable
    if [ -x "node_modules/peekaboo/peekaboo" ]; then
        echo "✅ Binary is executable"
        
        # Test the binary
        echo ""
        echo "🧪 Testing Swift CLI..."
        if node_modules/peekaboo/peekaboo --version; then
            echo "✅ Swift CLI works!"
        else
            echo "❌ Swift CLI failed"
        fi
    else
        echo "❌ Binary is not executable"
    fi
else
    echo "❌ Binary not found!"
fi



# Cleanup
cd - > /dev/null
rm -rf "$TEMP_DIR"
rm -f "$PACKAGE_PATH"

echo ""
echo "✨ Package test complete!"
echo ""
echo "If all tests passed, the package is ready for publishing!"

[FILE: ../Peekaboo/scripts/prepare-release.js]
#!/usr/bin/env node

/**
 * Release preparation script for @steipete/peekaboo-mcp
 * 
 * This script performs comprehensive checks before release:
 * 1. Git status checks (branch, uncommitted files, sync with origin)
 * 2. TypeScript/Node.js checks (lint, type check, tests)
 * 3. Swift checks (format, lint, tests)
 * 4. Build and package verification
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = '') {
  console.log(`${color}${message}${colors.reset}`);
}

function logStep(step) {
  console.log(`\n${colors.bright}${colors.blue}━━━ ${step} ━━━${colors.reset}\n`);
}

function logSuccess(message) {
  log(`✅ ${message}`, colors.green);
}

function logError(message) {
  log(`❌ ${message}`, colors.red);
}

function logWarning(message) {
  log(`⚠️  ${message}`, colors.yellow);
}

function exec(command, options = {}) {
  try {
    return execSync(command, {
      cwd: projectRoot,
      stdio: 'pipe',
      encoding: 'utf8',
      ...options
    }).trim();
  } catch (error) {
    if (options.allowFailure) {
      return null;
    }
    throw error;
  }
}

function execWithOutput(command, description) {
  try {
    log(`Running: ${description}...`, colors.cyan);
    execSync(command, {
      cwd: projectRoot,
      stdio: 'inherit'
    });
    return true;
  } catch (error) {
    return false;
  }
}

// Check functions
function checkGitStatus() {
  logStep('Git Status Checks');

  // Check current branch
  const currentBranch = exec('git branch --show-current');
  if (currentBranch !== 'main') {
    logWarning(`Currently on branch '${currentBranch}', not 'main'`);
    const proceed = process.argv.includes('--force');
    if (!proceed) {
      logError('Switch to main branch before releasing (use --force to override)');
      return false;
    }
  } else {
    logSuccess('On main branch');
  }

  // Check for uncommitted changes
  const gitStatus = exec('git status --porcelain');
  if (gitStatus) {
    logError('Uncommitted changes detected:');
    console.log(gitStatus);
    return false;
  }
  logSuccess('No uncommitted changes');

  // Check if up to date with origin
  exec('git fetch');
  const behind = exec('git rev-list HEAD..origin/main --count');
  const ahead = exec('git rev-list origin/main..HEAD --count');
  
  if (behind !== '0') {
    logError(`Branch is ${behind} commits behind origin/main`);
    return false;
  }
  if (ahead !== '0') {
    logWarning(`Branch is ${ahead} commits ahead of origin/main (remember to push after release)`);
  } else {
    logSuccess('Branch is up to date with origin/main');
  }

  return true;
}

function checkDependencies() {
  logStep('Dependency Checks');

  // Check if node_modules exists
  if (!existsSync(join(projectRoot, 'node_modules'))) {
    log('Installing dependencies...', colors.yellow);
    if (!execWithOutput('npm install', 'npm install')) {
      logError('Failed to install dependencies');
      return false;
    }
  }

  // Check for outdated dependencies
  const outdated = exec('npm outdated --json', { allowFailure: true });
  if (outdated) {
    try {
      const outdatedPkgs = JSON.parse(outdated);
      const count = Object.keys(outdatedPkgs).length;
      if (count > 0) {
        logWarning(`${count} outdated dependencies found (run 'npm outdated' for details)`);
      }
    } catch {
      // Ignore parse errors
    }
  }
  
  logSuccess('Dependencies checked');
  return true;
}

function checkTypeScript() {
  logStep('TypeScript Checks');

  // Clean build directory
  log('Cleaning build directory...', colors.cyan);
  rmSync(join(projectRoot, 'dist'), { recursive: true, force: true });

  // Run ESLint
  if (!execWithOutput('npm run lint', 'ESLint')) {
    logError('ESLint found violations');
    return false;
  }
  logSuccess('ESLint passed');

  // Type check
  if (!execWithOutput('npm run build', 'TypeScript compilation')) {
    logError('TypeScript compilation failed');
    return false;
  }
  logSuccess('TypeScript compilation successful');

  // Run TypeScript tests
  if (!execWithOutput('npm test', 'TypeScript tests')) {
    logError('TypeScript tests failed');
    return false;
  }
  logSuccess('TypeScript tests passed');

  return true;
}

function checkSwift() {
  logStep('Swift Checks');

  // Run SwiftFormat
  if (!execWithOutput('npm run format:swift', 'SwiftFormat')) {
    logError('SwiftFormat failed');
    return false;
  }
  logSuccess('SwiftFormat completed');

  // Check if SwiftFormat made any changes
  const formatChanges = exec('git status --porcelain');
  if (formatChanges) {
    logError('SwiftFormat made changes. Please commit them before releasing:');
    console.log(formatChanges);
    return false;
  }

  // Run SwiftLint
  if (!execWithOutput('npm run lint:swift', 'SwiftLint')) {
    logError('SwiftLint found violations');
    return false;
  }
  logSuccess('SwiftLint passed');

  // Check for Swift compiler warnings/errors
  log('Checking for Swift compiler warnings...', colors.cyan);
  let swiftBuildOutput = '';
  try {
    // Capture build output to check for warnings
    swiftBuildOutput = execSync('cd Apps/CLI && swift build --arch arm64 -c release 2>&1', {
      cwd: projectRoot,
      encoding: 'utf8'
    });
  } catch (error) {
    logError('Swift build failed during analyzer check');
    if (error.stdout) console.log(error.stdout);
    if (error.stderr) console.log(error.stderr);
    return false;
  }
  
  // Check for warnings in the output
  const warningMatches = swiftBuildOutput.match(/warning:|note:/gi);
  if (warningMatches && warningMatches.length > 0) {
    logWarning(`Found ${warningMatches.length} warnings/notes in Swift build`);
    // Extract and show warning lines
    const lines = swiftBuildOutput.split('\n');
    lines.forEach(line => {
      if (line.includes('warning:') || line.includes('note:')) {
        console.log(`  ${line.trim()}`);
      }
    });
  } else {
    logSuccess('No Swift compiler warnings found');
  }

  // Run Swift tests
  if (!execWithOutput('npm run test:swift', 'Swift tests')) {
    logError('Swift tests failed');
    return false;
  }
  logSuccess('Swift tests passed');

  // Test Swift CLI commands directly
  log('Testing Swift CLI commands...', colors.cyan);
  
  // Test help command
  const helpOutput = exec('./peekaboo --help', { allowFailure: true });
  if (!helpOutput || !helpOutput.includes('USAGE:')) {
    logError('Swift CLI help command failed');
    return false;
  }
  
  // Test version command
  const versionOutput = exec('./peekaboo --version', { allowFailure: true });
  if (!versionOutput) {
    logError('Swift CLI version command failed');
    return false;
  }
  
  // Test list apps command
  const appsOutput = exec('./peekaboo list apps --json-output', { allowFailure: true });
  if (!appsOutput) {
    logError('Swift CLI list apps command failed');
    return false;
  }
  
  try {
    const response = JSON.parse(appsOutput);
    if (!response.success || !response.data || !response.data.applications || !Array.isArray(response.data.applications)) {
      logError('Apps list has invalid structure');
      return false;
    }
    // Should always have at least some apps running
    if (response.data.applications.length === 0) {
      logError('No running applications found');
      return false;
    }
  } catch (e) {
    logError('Swift CLI apps JSON output is invalid');
    return false;
  }
  
  // Test list windows command for Finder  
  const windowsOutput = exec('./peekaboo list windows --app Finder --json-output', { allowFailure: true });
  if (!windowsOutput) {
    logError('Swift CLI list windows command failed');
    return false;
  }
  
  try {
    const response = JSON.parse(windowsOutput);
    if (!response.success || !response.data || !response.data.windows || !Array.isArray(response.data.windows)) {
      logError('Windows list has invalid structure');
      return false;
    }
    // Finder might not have windows, so just check structure
    if (!response.data.target_application_info) {
      logError('Windows response missing target_application_info');
      return false;
    }
  } catch (e) {
    logError('Swift CLI windows JSON output is invalid');
    return false;
  }
  
  // Test error handling - non-existent app
  const errorOutput = exec('./peekaboo list windows --app NonExistentApp12345 --json-output 2>&1', { allowFailure: true });
  if (errorOutput) {
    try {
      const errorData = JSON.parse(errorOutput);
      if (!errorData.error) {
        logWarning('Error response missing error field');
      }
    } catch (e) {
      // If it's not JSON, that's OK - might be stderr output
    }
  }
  
  // Test image command help
  const imageHelpOutput = exec('./peekaboo image --help', { allowFailure: true });
  if (!imageHelpOutput || !imageHelpOutput.includes('mode')) {
    logError('Swift CLI image help command failed');
    return false;
  }
  
  logSuccess('Swift CLI commands working correctly');

  return true;
}

function checkVersionAvailability() {
  logStep('Version Availability Check');

  const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
  const packageName = packageJson.name;
  const version = packageJson.version;

  log(`Checking if ${packageName}@${version} is already published...`, colors.cyan);

  // Check if version exists on npm
  const existingVersions = exec(`npm view ${packageName} versions --json`, { allowFailure: true });
  
  if (existingVersions) {
    try {
      const versions = JSON.parse(existingVersions);
      if (versions.includes(version)) {
        logError(`Version ${version} is already published on npm!`);
        logError('Please update the version in package.json before releasing.');
        return false;
      }
    } catch (e) {
      // If parsing fails, try to check if it's a single version
      if (existingVersions.includes(version)) {
        logError(`Version ${version} is already published on npm!`);
        logError('Please update the version in package.json before releasing.');
        return false;
      }
    }
  }

  logSuccess(`Version ${version} is available for publishing`);
  return true;
}

function checkChangelog() {
  logStep('Changelog Entry Check');

  const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
  const version = packageJson.version;

  // Read CHANGELOG.md
  const changelogPath = join(projectRoot, 'CHANGELOG.md');
  if (!existsSync(changelogPath)) {
    logError('CHANGELOG.md not found');
    return false;
  }

  const changelog = readFileSync(changelogPath, 'utf8');
  
  // Check for version entry (handle both x.x.x and x.x.x-beta.x formats)
  const versionPattern = new RegExp(`^#+\\s*(?:\\[)?${version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\])?`, 'm');
  if (!changelog.match(versionPattern)) {
    logError(`No entry found for version ${version} in CHANGELOG.md`);
    logError('Please add a changelog entry before releasing');
    return false;
  }

  logSuccess(`CHANGELOG.md contains entry for version ${version}`);
  return true;
}

function checkSecurityAudit() {
  logStep('Security Audit');

  log('Running npm audit...', colors.cyan);
  
  const auditResult = exec('npm audit --json', { allowFailure: true });
  
  if (auditResult) {
    try {
      const audit = JSON.parse(auditResult);
      const vulnCount = audit.metadata?.vulnerabilities || {};
      const total = Object.values(vulnCount).reduce((sum, count) => sum + count, 0);
      
      if (total > 0) {
        logWarning(`Found ${total} vulnerabilities:`);
        if (vulnCount.critical > 0) logError(`  Critical: ${vulnCount.critical}`);
        if (vulnCount.high > 0) logError(`  High: ${vulnCount.high}`);
        if (vulnCount.moderate > 0) logWarning(`  Moderate: ${vulnCount.moderate}`);
        if (vulnCount.low > 0) log(`  Low: ${vulnCount.low}`, colors.yellow);
        
        if (vulnCount.critical > 0 || vulnCount.high > 0) {
          logError('Critical or high severity vulnerabilities found. Please fix before releasing.');
          return false;
        }
        
        logWarning('Non-critical vulnerabilities found. Consider fixing before release.');
      } else {
        logSuccess('No security vulnerabilities found');
      }
    } catch (e) {
      logWarning('Could not parse npm audit results');
    }
  } else {
    logSuccess('No security vulnerabilities found');
  }
  
  return true;
}

function checkPackageSize() {
  logStep('Package Size Check');

  // Create a temporary package to get accurate size
  log('Calculating package size...', colors.cyan);
  const packOutput = exec('npm pack --dry-run 2>&1');
  
  // Extract size information
  const unpackedMatch = packOutput.match(/unpacked size: ([^\n]+)/);
  
  if (unpackedMatch) {
    const sizeStr = unpackedMatch[1];
    
    // Convert to bytes for comparison
    let sizeInBytes = 0;
    if (sizeStr.includes('MB')) {
      sizeInBytes = parseFloat(sizeStr) * 1024 * 1024;
    } else if (sizeStr.includes('kB')) {
      sizeInBytes = parseFloat(sizeStr) * 1024;
    } else if (sizeStr.includes('B')) {
      sizeInBytes = parseFloat(sizeStr);
    }
    
    const maxSizeInBytes = 2 * 1024 * 1024; // 2MB
    
    if (sizeInBytes > maxSizeInBytes) {
      logWarning(`Package size (${sizeStr}) exceeds 2MB threshold`);
      logWarning('Consider reviewing included files to reduce package size');
    } else {
      logSuccess(`Package size (${sizeStr}) is within acceptable limits`);
    }
  } else {
    logWarning('Could not determine package size');
  }
  
  return true;
}

function checkTypeScriptDeclarations() {
  logStep('TypeScript Declarations Check');

  // Check if .d.ts files are generated
  const distPath = join(projectRoot, 'dist');
  
  if (!existsSync(distPath)) {
    logError('dist/ directory not found. Please build the project first.');
    return false;
  }
  
  // Look for .d.ts files
  const dtsFiles = exec(`find "${distPath}" -name "*.d.ts" -type f`, { allowFailure: true });
  
  if (!dtsFiles || dtsFiles.trim() === '') {
    logError('No TypeScript declaration files (.d.ts) found in dist/');
    logError('Ensure TypeScript is configured to generate declarations');
    return false;
  }
  
  const declarationFiles = dtsFiles.split('\n').filter(f => f.trim());
  log(`Found ${declarationFiles.length} TypeScript declaration files`, colors.cyan);
  
  // Check for main declaration file
  const mainDtsPath = join(distPath, 'index.d.ts');
  if (!existsSync(mainDtsPath)) {
    logError('Missing main declaration file: dist/index.d.ts');
    return false;
  }
  
  logSuccess('TypeScript declarations are properly generated');
  return true;
}

function checkMCPServerSmoke() {
  logStep('MCP Server Smoke Test');

  const serverPath = join(projectRoot, 'dist', 'index.js');
  
  if (!existsSync(serverPath)) {
    logError('Server not built. Please run build first.');
    return false;
  }
  
  log('Testing MCP server with simple JSON-RPC request...', colors.cyan);
  
  try {
    // Test with a simple tools/list request
    const testRequest = '{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}';
    const result = exec(`echo '${testRequest}' | node "${serverPath}"`, { allowFailure: true });
    
    if (!result) {
      logError('MCP server failed to respond');
      return false;
    }
    
    // Parse and validate response
    const lines = result.split('\n').filter(line => line.trim());
    const response = lines[lines.length - 1]; // Get last line (the actual response)
    
    try {
      const parsed = JSON.parse(response);
      
      if (parsed.error) {
        logError(`MCP server returned error: ${parsed.error.message}`);
        return false;
      }
      
      if (!parsed.result || !parsed.result.tools) {
        logError('MCP server response missing expected tools array');
        return false;
      }
      
      const toolCount = parsed.result.tools.length;
      log(`MCP server responded successfully with ${toolCount} tools`, colors.cyan);
      
    } catch (e) {
      logError('Failed to parse MCP server response');
      logError(`Response: ${response}`);
      return false;
    }
    
  } catch (error) {
    logError(`MCP server smoke test failed: ${error.message}`);
    return false;
  }
  
  logSuccess('MCP server smoke test passed');
  return true;
}

function checkSwiftCLIIntegration() {
  logStep('Swift CLI Integration Tests');
  
  log('Testing Swift CLI error handling and edge cases...', colors.cyan);
  
  // Test 1: Invalid command (since image is default, this gets interpreted as image subcommand argument)
  let invalidOutput;
  try {
    execSync('./peekaboo invalid-command 2>&1', { 
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: 'pipe'
    });
    logError('Swift CLI should fail for invalid command');
    return false;
  } catch (error) {
    invalidOutput = error.stdout || error.stderr || error.toString();
  }
  
  if (!invalidOutput.includes('Unexpected argument')) {
    logError('Swift CLI should show proper error for invalid command');
    return false;
  }
  
  // Test 2: Missing required arguments for window mode
  let missingArgsOutput;
  try {
    missingArgsOutput = execSync('./peekaboo image --mode window --json-output 2>&1', { 
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: 'pipe'
    });
  } catch (error) {
    // Command fails with non-zero exit code, but we want the output
    missingArgsOutput = error.stdout || error.stderr || '';
  }
  
  if (!missingArgsOutput) {
    logError('Swift CLI should produce output for missing --app with window mode');
    return false;
  }
  
  try {
    const errorData = JSON.parse(missingArgsOutput);
    if (!errorData.error || errorData.success !== false) {
      logError('Swift CLI should return error JSON for missing --app with window mode');
      return false;
    }
  } catch (e) {
    logError('Swift CLI should return valid JSON for missing --app error');
    return false;
  }
  
  // Test 3: Invalid window index
  let invalidWindowOutput;
  try {
    execSync('./peekaboo image --mode window --app Finder --window-index abc --json-output 2>&1', { 
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: 'pipe'
    });
    logError('Swift CLI should fail for invalid window index');
    return false;
  } catch (error) {
    invalidWindowOutput = error.stdout || error.stderr || error.toString();
  }
  
  if (!invalidWindowOutput.includes('invalid for') || !invalidWindowOutput.includes('window-index')) {
    logError('Swift CLI should show error for invalid window index');
    return false;
  }
  
  // Test 4: Test all subcommands are available
  const subcommands = ['list', 'image'];
  for (const cmd of subcommands) {
    const helpOutput = exec(`./peekaboo ${cmd} --help`, { allowFailure: true });
    if (!helpOutput || !helpOutput.includes('USAGE')) {
      logError(`Swift CLI ${cmd} command help not available`);
      return false;
    }
  }
  
  // Test 5: JSON output format validation
  const formats = [
    { cmd: './peekaboo list apps --json-output', required: ['success', 'data'] }
  ];
  
  for (const { cmd, required } of formats) {
    const output = exec(cmd, { allowFailure: true });
    if (!output) {
      logError(`Command failed: ${cmd}`);
      return false;
    }
    
    try {
      const response = JSON.parse(output);
      for (const field of required) {
        if (!(field in response)) {
          logError(`Missing required field '${field}' in: ${cmd}`);
          return false;
        }
      }
      // For list apps, also check data.applications exists
      if (cmd.includes('list apps') && (!response.data || !response.data.applications)) {
        logError(`Missing data.applications in: ${cmd}`);
        return false;
      }
    } catch (e) {
      logError(`Invalid JSON from: ${cmd}`);
      return false;
    }
  }
  
  // Test 6: Permission info in error messages
  // Try to capture without permissions (this is just a smoke test, actual permission errors depend on system state)
  const captureTest = exec('./peekaboo image --mode screen --json-output', { allowFailure: true });
  if (captureTest) {
    try {
      const result = JSON.parse(captureTest);
      if (result.success) {
        log('Screen capture succeeded (permissions granted)', colors.cyan);
      } else if (result.error && result.error.code === 'PERMISSION_DENIED_SCREEN_RECORDING') {
        log('Screen recording permission correctly detected as missing', colors.cyan);
      }
    } catch (e) {
      // Not JSON, might be a different error
    }
  }
  
  logSuccess('Swift CLI integration tests passed');
  return true;
}

function checkVersionConsistency() {
  logStep('Version Consistency Check');

  const packageJsonPath = join(projectRoot, 'package.json');
  const packageLockPath = join(projectRoot, 'package-lock.json');
  
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  const packageVersion = packageJson.version;
  
  // Check package-lock.json
  if (!existsSync(packageLockPath)) {
    logError('package-lock.json not found');
    return false;
  }
  
  const packageLock = JSON.parse(readFileSync(packageLockPath, 'utf8'));
  const lockVersion = packageLock.version;
  
  if (packageVersion !== lockVersion) {
    logError(`Version mismatch: package.json has ${packageVersion}, package-lock.json has ${lockVersion}`);
    logError('Run "npm install" to update package-lock.json');
    return false;
  }
  
  // Also check that the package name matches in package-lock
  if (packageLock.packages && packageLock.packages[''] && packageLock.packages[''].version !== packageVersion) {
    logError(`Version mismatch in package-lock.json packages section`);
    return false;
  }
  
  logSuccess(`Version ${packageVersion} is consistent across package.json and package-lock.json`);
  return true;
}

function checkRequiredFields() {
  logStep('Required Fields Validation');

  const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
  
  const requiredFields = {
    'name': 'Package name',
    'version': 'Package version',
    'description': 'Package description',
    'main': 'Main entry point',
    'type': 'Module type',
    'scripts': 'Scripts section',
    'repository': 'Repository information',
    'keywords': 'Keywords for npm search',
    'author': 'Author information',
    'license': 'License',
    'engines': 'Node.js engine requirements',
    'files': 'Files to include in package'
  };
  
  const missingFields = [];
  
  for (const [field, description] of Object.entries(requiredFields)) {
    if (!packageJson[field]) {
      missingFields.push(`${field} (${description})`);
    }
  }
  
  if (missingFields.length > 0) {
    logError('Missing required fields in package.json:');
    missingFields.forEach(field => logError(`  - ${field}`));
    return false;
  }
  
  // Additional validations
  if (!packageJson.repository || typeof packageJson.repository !== 'object' || !packageJson.repository.url) {
    logError('Repository field must be an object with a url property');
    return false;
  }
  
  if (!Array.isArray(packageJson.keywords) || packageJson.keywords.length === 0) {
    logWarning('Keywords array is empty. Consider adding keywords for better discoverability');
  }
  
  if (!packageJson.engines || !packageJson.engines.node) {
    logError('Missing engines.node field to specify Node.js version requirements');
    return false;
  }
  
  logSuccess('All required fields are present in package.json');
  return true;
}

function buildAndVerifyPackage() {
  logStep('Build and Package Verification');

  // Build everything
  if (!execWithOutput('npm run build:all', 'Full build (TypeScript + Swift)')) {
    logError('Build failed');
    return false;
  }
  logSuccess('Build completed successfully');

  // Create package
  log('Creating npm package...', colors.cyan);
  const packOutput = exec('npm pack --dry-run 2>&1');
  
  // Parse package details
  const sizeMatch = packOutput.match(/package size: ([^\n]+)/);
  const unpackedMatch = packOutput.match(/unpacked size: ([^\n]+)/);
  const filesMatch = packOutput.match(/total files: (\d+)/);
  
  if (sizeMatch && unpackedMatch && filesMatch) {
    log(`Package size: ${sizeMatch[1]}`, colors.cyan);
    log(`Unpacked size: ${unpackedMatch[1]}`, colors.cyan);
    log(`Total files: ${filesMatch[1]}`, colors.cyan);
  }

  // Verify critical files are included
  const requiredFiles = [
    'dist/index.js',
    'peekaboo',
    'README.md',
    'LICENSE'
  ];

  let allFilesPresent = true;
  for (const file of requiredFiles) {
    if (!packOutput.includes(file)) {
      logError(`Missing required file in package: ${file}`);
      allFilesPresent = false;
    }
  }

  if (!allFilesPresent) {
    return false;
  }
  logSuccess('All required files included in package');

  // Verify peekaboo binary
  log('Verifying peekaboo binary...', colors.cyan);
  const binaryPath = join(projectRoot, 'peekaboo');
  
  // Check if binary exists
  if (!existsSync(binaryPath)) {
    logError('peekaboo binary not found');
    return false;
  }
  
  // Check if binary is executable
  try {
    const stats = exec(`stat -f "%Lp" "${binaryPath}" 2>/dev/null || stat -c "%a" "${binaryPath}"`);
    const perms = parseInt(stats, 8);
    if ((perms & 0o111) === 0) {
      logError('peekaboo binary is not executable');
      return false;
    }
  } catch (error) {
    logError('Failed to check binary permissions');
    return false;
  }
  
  // Check binary architectures
  try {
    const lipoOutput = exec(`lipo -info "${binaryPath}"`);
    if (!lipoOutput.includes('arm64') || !lipoOutput.includes('x86_64')) {
      logError('peekaboo binary does not contain both architectures (arm64 and x86_64)');
      logError(`Found: ${lipoOutput}`);
      return false;
    }
    logSuccess('Binary contains both arm64 and x86_64 architectures');
  } catch (error) {
    logError('Failed to check binary architectures (lipo command failed)');
    return false;
  }
  
  // Check if binary responds to --help
  try {
    const helpOutput = exec(`"${binaryPath}" --help`);
    if (!helpOutput || helpOutput.length === 0) {
      logError('peekaboo binary does not respond to --help command');
      return false;
    }
    logSuccess('Binary responds correctly to --help command');
  } catch (error) {
    logError('peekaboo binary failed to execute with --help');
    logError(`Error: ${error.message}`);
    return false;
  }
  
  logSuccess('peekaboo binary verification passed');

  // Check package.json version
  const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
  const version = packageJson.version;
  
  if (!version.match(/^\d+\.\d+\.\d+(-\w+\.\d+)?$/)) {
    logError(`Invalid version format: ${version}`);
    return false;
  }
  log(`Package version: ${version}`, colors.cyan);

  // Integration tests
  if (!execWithOutput('npm run test:integration', 'Integration tests')) {
    logError('Integration tests failed');
    return false;
  }
  logSuccess('Integration tests passed');

  return true;
}

// Main execution
async function main() {
  console.log(`\n${colors.bright}🚀 Peekaboo MCP Release Preparation${colors.reset}\n`);

  const checks = [
    checkGitStatus,
    checkRequiredFields,
    checkDependencies,
    checkSecurityAudit,
    checkVersionAvailability,
    checkVersionConsistency,
    checkChangelog,
    checkTypeScript,
    checkTypeScriptDeclarations,
    checkSwift,
    buildAndVerifyPackage,
    checkSwiftCLIIntegration,
    checkPackageSize,
    checkMCPServerSmoke
  ];

  for (const check of checks) {
    if (!check()) {
      console.log(`\n${colors.red}${colors.bright}❌ Release preparation failed!${colors.reset}\n`);
      process.exit(1);
    }
  }

  console.log(`\n${colors.green}${colors.bright}✅ All checks passed! Ready to release! 🎉${colors.reset}\n`);
  
  const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
  console.log(`${colors.cyan}Next steps:${colors.reset}`);
  console.log(`1. Update version in package.json (current: ${packageJson.version})`);
  console.log(`2. Update CHANGELOG.md`);
  console.log(`3. Commit version bump: git commit -am "Release v<version>"`);
  console.log(`4. Create tag: git tag v<version>`);
  console.log(`5. Push changes: git push origin main --tags`);
  console.log(`6. Publish to npm: npm publish [--tag beta]`);
  console.log(`7. Create GitHub release\n`);
}

// Run the script
main().catch(error => {
  logError(`Unexpected error: ${error.message}`);
  process.exit(1);
});

[FILE: ../Peekaboo/scripts/README-pblog.md]
# pblog - Peekaboo Log Viewer

A unified log viewer for all Peekaboo applications and services.

## Quick Start

```bash
# Show recent logs from all Peekaboo subsystems
./scripts/pblog.sh

# Stream logs continuously
./scripts/pblog.sh -f

# Show only errors
./scripts/pblog.sh -e

# Show logs from a specific service
./scripts/pblog.sh -c ElementDetectionService

# Show logs from a specific subsystem
./scripts/pblog.sh --subsystem boo.peekaboo.core
```

## Supported Subsystems

- `boo.peekaboo.core` - Core services (ClickService, ElementDetectionService, etc.)
- `boo.peekaboo.cli` - CLI tool
- `boo.peekaboo.inspector` - Inspector app
- `boo.peekaboo.playground` - Playground test app
- `boo.peekaboo.app` - Main Mac app
- `boo.peekaboo` - Mac app components

## Options

- `-n, --lines NUM` - Number of lines to show (default: 50)
- `-l, --last TIME` - Time range to search (default: 5m)
- `-c, --category CAT` - Filter by category (e.g., ClickService)
- `-s, --search TEXT` - Search for specific text
- `-d, --debug` - Show debug level logs
- `-f, --follow` - Stream logs continuously
- `-e, --errors` - Show only errors
- `--subsystem NAME` - Filter by specific subsystem
- `--json` - Output in JSON format

## Examples

```bash
# Debug element detection issues
./scripts/pblog.sh -c ElementDetectionService -d

# Monitor click operations
./scripts/pblog.sh -c ClickService -f

# Check recent errors
./scripts/pblog.sh -e -l 30m

# Search for specific text
./scripts/pblog.sh -s "Dialog" -n 100

# Monitor Playground app logs
./scripts/pblog.sh --subsystem boo.peekaboo.playground -f
```

[FILE: ../Peekaboo/scripts/poltergeist-wrapper.sh]
#!/bin/bash

# Wrapper script to run Poltergeist from the correct directory
# This works around the issue where Poltergeist doesn't handle
# being run from outside its directory properly

# Get the directory of this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"

# Change to project directory to ensure paths are resolved correctly
cd "$PROJECT_DIR"

# Run Poltergeist with all arguments passed through
exec node ../poltergeist/dist/cli.js "$@"

[FILE: ../Peekaboo/scripts/runner.ts]
#!/usr/bin/env bun
/**
 * Sweetistics runner wrapper: enforces timeouts, git policy, and trash-safe deletes before dispatching any repo command.
 * When you tweak its behavior, add a short note to AGENTS.md via `./scripts/committer "docs: update AGENTS for runner" "AGENTS.md"` so other agents know the new expectations.
 */

import { type ChildProcess, spawn } from 'node:child_process';
import { cpSync, existsSync, renameSync, rmSync } from 'node:fs';
import { constants as osConstants } from 'node:os';
import { basename, isAbsolute, join, normalize, resolve } from 'node:path';
import process from 'node:process';

import {
  analyzeGitExecution,
  evaluateGitPolicies,
  type GitCommandInfo,
  type GitExecutionContext,
  type GitInvocation,
} from './git-policy';

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const EXTENDED_TIMEOUT_MS = 20 * 60 * 1000;
const LONG_TIMEOUT_MS = 25 * 60 * 1000; // Build + full-suite commands (Next.js build, test:all) routinely spike past 20 minutes—give them explicit headroom before tmux escalation.
const LINT_TIMEOUT_MS = 30 * 60 * 1000;
const LONG_RUN_REPORT_THRESHOLD_MS = 60 * 1000;
const ENABLE_DEBUG_LOGS = process.env.RUNNER_DEBUG === '1';
const MAX_SLEEP_SECONDS = 30;

const WRAPPER_COMMANDS = new Set([
  'sudo',
  '/usr/bin/sudo',
  'env',
  '/usr/bin/env',
  'command',
  '/bin/command',
  'nohup',
  '/usr/bin/nohup',
]);

const ENV_ASSIGNMENT_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*=.*/;
type SummaryStyle = 'compact' | 'minimal' | 'verbose';
const SUMMARY_STYLE = resolveSummaryStyle(process.env.RUNNER_SUMMARY_STYLE);
// biome-ignore format: keep each keyword on its own line for grep-friendly diffs.
const LONG_SCRIPT_KEYWORDS = [
  'build',
  'test:all',
  'test:browser',
  'test:e2e',
  'test:e2e:headed',
  'vitest.browser',
  'vitest.browser.config.ts',
];
const EXTENDED_SCRIPT_KEYWORDS = ['lint', 'test', 'playwright', 'check', 'docker'];
const SINGLE_TEST_SCRIPTS = new Set(['test:file']);
const SINGLE_TEST_FLAGS = new Set(['--run', '--filter']);
const TEST_BINARIES = new Set(['vitest', 'playwright', 'jest']);
const LINT_BINARIES = new Set(['eslint', 'biome', 'oxlint', 'knip']);

type RunnerExecutionContext = {
  commandArgs: string[];
  workspaceDir: string;
  timeoutMs: number;
};

type CommandInterceptionResult = { handled: true } | { handled: false; gitContext: GitExecutionContext };

type GitRmPlan = {
  paths: string[];
  stagingOptions: string[];
  allowMissing: boolean;
  shouldIntercept: boolean;
};

type MoveResult = {
  missing: string[];
  errors: string[];
};

let cachedTrashCliCommand: string | null | undefined;

(async () => {
  const commandArgs = parseArgs(process.argv.slice(2));

  if (commandArgs.length === 0) {
    printUsage('Missing command to execute.');
    process.exit(1);
  }

  const workspaceDir = process.cwd();
  const timeoutMs = determineEffectiveTimeoutMs(commandArgs);
  const context: RunnerExecutionContext = {
    commandArgs,
    workspaceDir,
    timeoutMs,
  };

  enforcePolterArgumentSeparator(commandArgs);

  const interception = await resolveCommandInterception(context);
  if (interception.handled) {
    return;
  }

  enforceGitPolicies(interception.gitContext);

  await runCommand(context);
})().catch((error) => {
  console.error('[runner] Unexpected failure:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});

// Parses the runner CLI args and rejects unsupported flags early.
function parseArgs(argv: string[]): string[] {
  const commandArgs: string[] = [];
  let parsingOptions = true;

  for (const token of argv) {
    if (!parsingOptions) {
      commandArgs.push(token);
      continue;
    }

    if (token === '--') {
      parsingOptions = false;
      continue;
    }

    if (token === '--help' || token === '-h') {
      printUsage();
      process.exit(0);
    }

    if (token === '--timeout' || token.startsWith('--timeout=')) {
      console.error('[runner] --timeout is no longer supported; rely on the automatic timeouts.');
      process.exit(1);
    }

    parsingOptions = false;
    commandArgs.push(token);
  }

  return commandArgs;
}

function enforcePolterArgumentSeparator(commandArgs: string[]): void {
  const invocation = findPolterPeekabooInvocation(commandArgs);
  if (!invocation) {
    return;
  }

  const afterPeekaboo = commandArgs.slice(invocation.peekabooIndex + 1);
  if (afterPeekaboo.length === 0) {
    return;
  }

  const separatorPos = afterPeekaboo.indexOf('--');
  const toInspect = separatorPos === -1 ? afterPeekaboo : afterPeekaboo.slice(0, separatorPos);
  const flagToken = toInspect.find((token) => token.startsWith('-'));
  if (flagToken) {
    console.error(
      `[runner] polter peekaboo commands must insert '--' before CLI flags so Poltergeist does not consume them. Example: polter peekaboo -- dialog dismiss --force`,
    );
    console.error(`[runner] Offending flag: ${flagToken}`);
    process.exit(1);
  }
}

function findPolterPeekabooInvocation(commandArgs: string[]): { polterIndex: number; peekabooIndex: number } | null {
  for (let i = 0; i < commandArgs.length; i += 1) {
    const token = commandArgs[i];
    if (WRAPPER_COMMANDS.has(token) || ENV_ASSIGNMENT_PATTERN.test(token)) {
      continue;
    }
    if (token === 'polter' && i + 1 < commandArgs.length && commandArgs[i + 1] === 'peekaboo') {
      return { polterIndex: i, peekabooIndex: i + 1 };
    }
    break;
  }
  return null;
}

// Computes the timeout tier for the provided command tokens.
function determineEffectiveTimeoutMs(commandArgs: string[]): number {
  const strippedTokens = stripWrappersAndAssignments(commandArgs);
  if (isTestRunnerSuiteInvocation(strippedTokens, 'integration')) {
    return EXTENDED_TIMEOUT_MS;
  }
  if (referencesIntegrationSpec(strippedTokens)) {
    return EXTENDED_TIMEOUT_MS;
  }
  if (shouldUseLintTimeout(commandArgs)) {
    return LINT_TIMEOUT_MS;
  }
  if (shouldUseLongTimeout(commandArgs)) {
    return LONG_TIMEOUT_MS;
  }
  if (shouldExtendTimeout(commandArgs) && !isSingleTestInvocation(commandArgs)) {
    return EXTENDED_TIMEOUT_MS;
  }
  return DEFAULT_TIMEOUT_MS;
}

// Determines whether the command matches any keyword requiring extra time.
function shouldExtendTimeout(commandArgs: string[]): boolean {
  const tokens = stripWrappersAndAssignments(commandArgs);
  if (tokens.length === 0) {
    return false;
  }

  const [first, ...rest] = tokens;
  if (!first) {
    return false;
  }

  if (first === 'pnpm') {
    return shouldExtendViaPnpm(rest);
  }
  if (first === 'bun') {
    return shouldExtendViaBun(rest);
  }

  if (shouldExtendForScript(first) || TEST_BINARIES.has(first.toLowerCase())) {
    return true;
  }

  return rest.some((token) => shouldExtendForScript(token) || TEST_BINARIES.has(token.toLowerCase()));
}

function shouldExtendViaPnpm(rest: string[]): boolean {
  if (rest.length === 0) {
    return false;
  }
  const subcommand = rest[0];
  if (!subcommand) {
    return false;
  }
  if (subcommand === 'run') {
    const script = rest[1];
    return typeof script === 'string' && shouldExtendForScript(script);
  }
  if (subcommand === 'exec') {
    const execTarget = rest[1];
    if (execTarget && (shouldExtendForScript(execTarget) || TEST_BINARIES.has(execTarget.toLowerCase()))) {
      return true;
    }
    return rest.slice(1).some((token) => shouldExtendForScript(token) || TEST_BINARIES.has(token.toLowerCase()));
  }
  return shouldExtendForScript(subcommand);
}

function shouldExtendViaBun(rest: string[]): boolean {
  if (rest.length === 0) {
    return false;
  }
  const subcommand = rest[0];
  if (!subcommand) {
    return false;
  }
  if (subcommand === 'run') {
    const script = rest[1];
    return typeof script === 'string' && shouldExtendForScript(script);
  }
  if (subcommand === 'test') {
    return true;
  }
  if (subcommand === 'x' || subcommand === 'bunx') {
    const execTarget = rest[1];
    if (execTarget && TEST_BINARIES.has(execTarget.toLowerCase())) {
      return true;
    }
  }
  return shouldExtendForScript(subcommand);
}

// Checks script names for long-running markers (lint/test/build/etc.).
function shouldExtendForScript(script: string): boolean {
  if (SINGLE_TEST_SCRIPTS.has(script)) {
    return false;
  }
  return matchesScriptKeyword(script, EXTENDED_SCRIPT_KEYWORDS);
}

// Gives lint invocations the dedicated timeout bucket.
function shouldUseLintTimeout(commandArgs: string[]): boolean {
  const tokens = stripWrappersAndAssignments(commandArgs);
  if (tokens.length === 0) {
    return false;
  }

  const [first, ...rest] = tokens;
  if (!first) {
    return false;
  }

  if (first === 'pnpm') {
    return shouldUseLintTimeoutViaPnpm(rest);
  }
  if (first === 'bun') {
    return shouldUseLintTimeoutViaBun(rest);
  }

  return LINT_BINARIES.has(first.toLowerCase());
}

function shouldUseLintTimeoutViaPnpm(rest: string[]): boolean {
  if (rest.length === 0) {
    return false;
  }
  const subcommand = rest[0];
  if (!subcommand) {
    return false;
  }
  if (subcommand === 'run') {
    const script = rest[1];
    return typeof script === 'string' && script.startsWith('lint');
  }
  if (subcommand === 'exec') {
    const execTarget = rest[1];
    if (execTarget && LINT_BINARIES.has(execTarget.toLowerCase())) {
      return true;
    }
    return rest.slice(1).some((token) => LINT_BINARIES.has(token.toLowerCase()));
  }
  return LINT_BINARIES.has(subcommand.toLowerCase());
}

function shouldUseLintTimeoutViaBun(rest: string[]): boolean {
  if (rest.length === 0) {
    return false;
  }
  const subcommand = rest[0];
  if (!subcommand) {
    return false;
  }
  if (subcommand === 'run') {
    const script = rest[1];
    return typeof script === 'string' && script.startsWith('lint');
  }
  if (subcommand === 'x' || subcommand === 'bunx') {
    return rest.slice(1).some((token) => LINT_BINARIES.has(token.toLowerCase()));
  }
  return LINT_BINARIES.has(subcommand.toLowerCase());
}

// Detects when a user is running a single spec so we can keep the shorter timeout.
function isSingleTestInvocation(commandArgs: string[]): boolean {
  const tokens = stripWrappersAndAssignments(commandArgs);
  if (tokens.length === 0) {
    return false;
  }

  if (tokens.some((token) => SINGLE_TEST_FLAGS.has(token))) {
    return true;
  }

  const [first, ...rest] = tokens;
  if (!first) {
    return false;
  }

  if (first === 'pnpm') {
    return isSingleTestViaPnpm(rest);
  }
  if (first === 'bun') {
    return isSingleTestViaBun(rest);
  }
  if (first === 'vitest') {
    return rest.some((token) => SINGLE_TEST_FLAGS.has(token));
  }

  return SINGLE_TEST_SCRIPTS.has(first);
}

function isSingleTestViaPnpm(rest: string[]): boolean {
  if (rest.length === 0) {
    return false;
  }
  const subcommand = rest[0];
  if (!subcommand) {
    return false;
  }
  if (subcommand === 'run') {
    const script = rest[1];
    return typeof script === 'string' && SINGLE_TEST_SCRIPTS.has(script);
  }
  if (subcommand === 'exec') {
    return rest.slice(1).some((token) => SINGLE_TEST_FLAGS.has(token));
  }
  return SINGLE_TEST_SCRIPTS.has(subcommand);
}

function isSingleTestViaBun(rest: string[]): boolean {
  if (rest.length === 0) {
    return false;
  }
  const subcommand = rest[0];
  if (!subcommand) {
    return false;
  }
  if (subcommand === 'run') {
    const script = rest[1];
    return typeof script === 'string' && SINGLE_TEST_SCRIPTS.has(script);
  }
  if (subcommand === 'test') {
    return true;
  }
  if (subcommand === 'x' || subcommand === 'bunx') {
    return rest.slice(1).some((token) => SINGLE_TEST_FLAGS.has(token));
  }
  return false;
}

// Normalizes potential file paths/flags to aid comparison across shells.
function normalizeForPathComparison(token: string): string {
  return token.replaceAll('\\', '/');
}

// Heuristically checks if a CLI token references an integration spec.
function tokenReferencesIntegrationTest(token: string): boolean {
  const normalized = normalizeForPathComparison(token);
  if (normalized.includes('tests/integration/')) {
    return true;
  }
  if (normalized.startsWith('--run=') || normalized.startsWith('--include=')) {
    const value = normalized.split('=', 2)[1] ?? '';
    return value.includes('tests/integration/');
  }
  return false;
}

// Scans the entire command for integration spec references.
function referencesIntegrationSpec(tokens: string[]): boolean {
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) {
      continue;
    }
    if (token === '--run' || token === '--include') {
      const next = tokens[index + 1];
      if (next && tokenReferencesIntegrationTest(next)) {
        return true;
      }
    }
    if (tokenReferencesIntegrationTest(token)) {
      return true;
    }
  }
  return false;
}

// Helper that matches a script token against a keyword allowlist.
function matchesScriptKeyword(script: string, keywords: readonly string[]): boolean {
  const lowered = script.toLowerCase();
  return keywords.some((keyword) => lowered === keyword || lowered.startsWith(`${keyword}:`));
}

// Removes wrapper binaries/env assignments so heuristics see the real command.
function stripWrappersAndAssignments(args: string[]): string[] {
  const tokens = [...args];

  while (tokens.length > 0) {
    const candidate = tokens[0];
    if (!candidate) {
      break;
    }
    if (!isEnvAssignment(candidate)) {
      break;
    }
    tokens.shift();
  }

  while (tokens.length > 0) {
    const wrapper = tokens[0];
    if (!wrapper) {
      break;
    }
    if (!WRAPPER_COMMANDS.has(wrapper)) {
      break;
    }
    tokens.shift();
    while (tokens.length > 0) {
      const assignment = tokens[0];
      if (!assignment) {
        break;
      }
      if (!isEnvAssignment(assignment)) {
        break;
      }
      tokens.shift();
    }
  }

  return tokens;
}

// Checks whether a token is an inline environment variable assignment.
function isEnvAssignment(token: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=.*/.test(token);
}

// Detects `pnpm test:<suite>` style calls regardless of wrappers.
function isTestRunnerSuiteInvocation(tokens: string[], suite: string): boolean {
  if (tokens.length === 0) {
    return false;
  }

  const normalizedSuite = suite.toLowerCase();
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) {
      continue;
    }
    const normalizedToken = token.replace(/^[./\\]+/, '');
    if (normalizedToken === 'scripts/test-runner.ts' || normalizedToken.endsWith('/scripts/test-runner.ts')) {
      const suiteToken = tokens[index + 1]?.toLowerCase();
      if (suiteToken === normalizedSuite) {
        return true;
      }
    }
  }

  return false;
}

// Grants the longest timeout to explicitly tagged long-running scripts.
function shouldUseLongTimeout(commandArgs: string[]): boolean {
  const tokens = stripWrappersAndAssignments(commandArgs);
  if (tokens.length === 0) {
    return false;
  }

  const first = tokens[0];
  if (!first) {
    return false;
  }
  const rest = tokens.slice(1);
  const matches = (token: string): boolean => matchesScriptKeyword(token, LONG_SCRIPT_KEYWORDS);

  if (first === 'pnpm') {
    if (rest.length === 0) {
      return false;
    }
    const subcommand = rest[0];
    if (!subcommand) {
      return false;
    }
    if (subcommand === 'run') {
      const script = rest[1];
      if (script && matches(script)) {
        return true;
      }
    } else if (matches(subcommand)) {
      return true;
    }
    for (const token of rest.slice(1)) {
      if (matches(token)) {
        return true;
      }
    }
    return false;
  }

  if (matches(first)) {
    return true;
  }

  for (const token of rest) {
    if (matches(token)) {
      return true;
    }
  }

  return false;
}

// Kicks off the requested command with logging, timeouts, and monitoring.
async function runCommand(context: RunnerExecutionContext): Promise<void> {
  const { command, args, env } = buildExecutionParams(context.commandArgs);
  const commandLabel = formatDisplayCommand(context.commandArgs);

  const startTime = Date.now();

  const child = spawn(command, args, {
    cwd: context.workspaceDir,
    env,
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  if (isRunnerTmuxSession()) {
    const childPidInfo = typeof child.pid === 'number' ? ` (pid ${child.pid})` : '';
    console.error(`[runner] Watching ${commandLabel}${childPidInfo}. Wait for the closing sentinel before moving on.`);
  }

  const removeSignalHandlers = registerSignalForwarding(child);

  if (child.stdout) {
    child.stdout.on('data', (chunk: Buffer) => {
      process.stdout.write(chunk);
    });
  }

  if (child.stderr) {
    child.stderr.on('data', (chunk: Buffer) => {
      process.stderr.write(chunk);
    });
  }

  let killTimer: NodeJS.Timeout | null = null;
  try {
    const result = await new Promise<{ exitCode: number; timedOut: boolean }>((resolve, reject) => {
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        if (ENABLE_DEBUG_LOGS) {
          console.error(`[runner] Command exceeded ${formatDuration(context.timeoutMs)}; sending SIGTERM.`);
        }
        if (!child.killed) {
          child.kill('SIGTERM');
          killTimer = setTimeout(() => {
            if (!child.killed) {
              child.kill('SIGKILL');
            }
          }, 5_000);
        }
      }, context.timeoutMs);

      child.once('error', (error) => {
        clearTimeout(timeout);
        if (killTimer) {
          clearTimeout(killTimer);
        }
        removeSignalHandlers();
        reject(error);
      });

      child.once('exit', (code, signal) => {
        clearTimeout(timeout);
        if (killTimer) {
          clearTimeout(killTimer);
        }
        removeSignalHandlers();
        resolve({ exitCode: code ?? exitCodeFromSignal(signal), timedOut });
      });
    });
    const { exitCode, timedOut } = result;

    const elapsedMs = Date.now() - startTime;
    if (timedOut) {
      console.error(
        `[runner] Command terminated after ${formatDuration(context.timeoutMs)}. Re-run inside tmux for long-lived work.`
      );
      console.error(
        formatCompletionSummary({ exitCode, elapsedMs, timedOut: true, commandLabel })
      );
      process.exit(124);
    }

    if (elapsedMs >= LONG_RUN_REPORT_THRESHOLD_MS) {
      console.error(
        `[runner] Completed in ${formatDuration(elapsedMs)}. For long-running tasks, prefer tmux directly.`
      );
    }

    console.error(formatCompletionSummary({ exitCode, elapsedMs, commandLabel }));
    process.exit(exitCode);
  } catch (error) {
    console.error('[runner] Failed to launch command:', error instanceof Error ? error.message : String(error));
    process.exit(1);
    return;
  }
}

async function runCommandWithoutTimeout(context: RunnerExecutionContext): Promise<void> {
  const { command, args, env } = buildExecutionParams(context.commandArgs);
  const commandLabel = formatDisplayCommand(context.commandArgs);
  const startTime = Date.now();

  const child = spawn(command, args, {
    cwd: context.workspaceDir,
    env,
    stdio: 'inherit',
  });

  const removeSignalHandlers = registerSignalForwarding(child);

  try {
    const exitCode = await new Promise<number>((resolve, reject) => {
      child.once('error', (error) => {
        removeSignalHandlers();
        reject(error);
      });
      child.once('exit', (code, signal) => {
        removeSignalHandlers();
        resolve(code ?? exitCodeFromSignal(signal));
      });
    });
    const elapsedMs = Date.now() - startTime;
    console.error(formatCompletionSummary({ exitCode, elapsedMs, commandLabel }));
    process.exit(exitCode);
  } catch (error) {
    console.error('[runner] Failed to launch command:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Prepares the executable, args, and sanitized env for the child process.
function buildExecutionParams(commandArgs: string[]): { command: string; args: string[]; env: NodeJS.ProcessEnv } {
  const env = { ...process.env };
  const args: string[] = [];
  let commandStarted = false;

  for (const token of commandArgs) {
    if (!commandStarted && isEnvAssignment(token)) {
      const [key, ...rest] = token.split('=');
      if (key) {
        env[key] = rest.join('=');
      }
      continue;
    }
    commandStarted = true;
    args.push(token);
  }

  if (args.length === 0 || !args[0]) {
    printUsage('Missing command to execute.');
    process.exit(1);
  }

  const [command, ...restArgs] = args;
  return { command, args: restArgs, env };
}

// Forwards termination signals to the child and returns an unregister hook.
function registerSignalForwarding(child: ChildProcess): () => void {
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  const handlers = new Map<NodeJS.Signals, () => void>();

  for (const signal of signals) {
    const handler = () => {
      if (!child.killed) {
        child.kill(signal);
      }
    };
    handlers.set(signal, handler);
    process.on(signal, handler);
  }

  return () => {
    for (const [signal, handler] of handlers) {
      process.off(signal, handler);
    }
  };
}

// Maps a terminating signal to the exit code conventions bash expects.
function exitCodeFromSignal(signal: NodeJS.Signals | null): number {
  if (!signal) {
    return 0;
  }
  const code = (osConstants.signals as Record<string, number | undefined>)[signal];
  if (typeof code === 'number') {
    return 128 + code;
  }
  return 1;
}

// Gives policy interceptors a chance to fully handle a command before exec.
async function resolveCommandInterception(context: RunnerExecutionContext): Promise<CommandInterceptionResult> {
  const interceptors: Array<(ctx: RunnerExecutionContext) => Promise<boolean>> = [
    maybeHandleTmuxInvocation,
    maybeHandleFindInvocation,
    maybeHandleRmInvocation,
    maybeHandleSleepInvocation,
  ];

  for (const interceptor of interceptors) {
    if (await interceptor(context)) {
      return { handled: true };
    }
  }

  const gitContext = analyzeGitExecution(context.commandArgs, context.workspaceDir);

  if (await maybeHandleGitRm(gitContext)) {
    return { handled: true };
  }

  return { handled: false, gitContext };
}

// Runs the shared git policy analyzers before dispatching the command.
function enforceGitPolicies(gitContext: GitExecutionContext) {
  const evaluation = evaluateGitPolicies(gitContext);
  const hasConsentOverride = process.env.RUNNER_THE_USER_GAVE_ME_CONSENT === '1';

  if (gitContext.subcommand === 'rebase' && !hasConsentOverride) {
    console.error(
      'git rebase requires the user to explicitly type "rebase" in chat. Once they do, rerun with RUNNER_THE_USER_GAVE_ME_CONSENT=1 in the same command (e.g. RUNNER_THE_USER_GAVE_ME_CONSENT=1 ./runner git rebase --continue).'
    );
    process.exit(1);
  }

  if (evaluation.requiresCommitHelper) {
    console.error(
      'Direct git add/commit is disabled. Use ./scripts/committer "chore(runner): describe change" "scripts/runner.ts" instead—see AGENTS.md and ./scripts/committer for details. The helper auto-stashes unrelated files before committing.'
    );
    process.exit(1);
  }

  if (evaluation.requiresExplicitConsent || evaluation.isDestructive) {
    if (hasConsentOverride) {
      if (ENABLE_DEBUG_LOGS) {
        const reason = evaluation.isDestructive ? 'destructive git command' : 'guarded git command';
        console.error(`[runner] Proceeding with ${reason} because RUNNER_THE_USER_GAVE_ME_CONSENT=1.`);
      }
    } else {
      if (evaluation.isDestructive) {
        console.error(
          `git ${gitContext.subcommand ?? ''} can overwrite or discard work. Confirm with the user first, then re-run with RUNNER_THE_USER_GAVE_ME_CONSENT=1 if they approve.`
        );
      } else {
        console.error(
          `Using git ${gitContext.subcommand ?? ''} requires consent. Set RUNNER_THE_USER_GAVE_ME_CONSENT=1 after verifying with the user, or ask them explicitly before proceeding.`
        );
      }
      process.exit(1);
    }
  }
}

// Handles guarded `find` invocations that may delete files outright.
async function maybeHandleFindInvocation(context: RunnerExecutionContext): Promise<boolean> {
  const findInvocation = extractFindInvocation(context.commandArgs);
  if (!findInvocation) {
    return false;
  }

  const findPlan = await buildFindDeletePlan(findInvocation.argv, context.workspaceDir);
  if (!findPlan) {
    return false;
  }

  const moveResult = await movePathsToTrash(findPlan.paths, context.workspaceDir, { allowMissing: false });
  if (moveResult.missing.length > 0) {
    for (const path of moveResult.missing) {
      console.error(`find: ${path}: No such file or directory`);
    }
    process.exit(1);
  }
  if (moveResult.errors.length > 0) {
    for (const error of moveResult.errors) {
      console.error(error);
    }
    process.exit(1);
  }
  process.exit(0);
  return true;
}

// Intercepts plain `rm` commands to route them through trash safeguards.
async function maybeHandleRmInvocation(context: RunnerExecutionContext): Promise<boolean> {
  const rmInvocation = extractRmInvocation(context.commandArgs);
  if (!rmInvocation) {
    return false;
  }

  const rmPlan = parseRmArguments(rmInvocation.argv);
  if (!rmPlan?.shouldIntercept) {
    return false;
  }

  try {
    const moveResult = await movePathsToTrash(rmPlan.targets, context.workspaceDir, { allowMissing: rmPlan.force });
    reportMissingForRm(moveResult.missing, rmPlan.force);
    if (moveResult.errors.length > 0) {
      for (const error of moveResult.errors) {
        console.error(error);
      }
      process.exit(1);
    }
    process.exit(0);
  } catch (error) {
    console.error(formatTrashError(error));
    process.exit(1);
  }
  return true;
}

// Applies git-specific rm protections before the command executes.
async function maybeHandleGitRm(gitContext: GitExecutionContext): Promise<boolean> {
  if (gitContext.command?.name !== 'rm' || !gitContext.invocation) {
    return false;
  }

  const gitRmPlan = parseGitRmArguments(gitContext.invocation.argv, gitContext.command);
  if (!gitRmPlan?.shouldIntercept) {
    return false;
  }

  try {
    const moveResult = await movePathsToTrash(gitRmPlan.paths, gitContext.workDir, {
      allowMissing: gitRmPlan.allowMissing,
    });
    if (!gitRmPlan.allowMissing && moveResult.missing.length > 0) {
      for (const path of moveResult.missing) {
        console.error(`git rm: ${path}: No such file or directory`);
      }
      process.exit(1);
    }
    if (moveResult.errors.length > 0) {
      for (const error of moveResult.errors) {
        console.error(error);
      }
      process.exit(1);
    }
    await stageGitRm(gitContext.workDir, gitRmPlan);
    process.exit(0);
  } catch (error) {
    console.error(formatTrashError(error));
    process.exit(1);
  }
  return true;
}

// Blocks `sleep` calls longer than the AGENTS.md ceiling so scripts cannot stall the runner.
async function maybeHandleSleepInvocation(context: RunnerExecutionContext): Promise<boolean> {
  const tokens = stripWrappersAndAssignments(context.commandArgs);
  if (tokens.length === 0) {
    return false;
  }
  const [first, ...rest] = tokens;
  if (!first || !isSleepBinary(first) || rest.length === 0) {
    return false;
  }

  const commandIndex = context.commandArgs.length - tokens.length;
  if (commandIndex < 0) {
    return false;
  }

  const adjustedArgs = [...context.commandArgs];
  const adjustments: string[] = [];

  for (let offset = 0; offset < rest.length; offset += 1) {
    const token = rest[offset];
    const durationSeconds = parseSleepDurationSeconds(token);
    if (durationSeconds == null || durationSeconds <= MAX_SLEEP_SECONDS) {
      continue;
    }
    adjustments.push(`${token}→${formatSleepDuration(MAX_SLEEP_SECONDS)}`);
    adjustedArgs[commandIndex + 1 + offset] = formatSleepArgument(MAX_SLEEP_SECONDS);
  }

  if (adjustments.length === 0) {
    return false;
  }

  console.error(
    `[runner] sleep arguments exceed ${MAX_SLEEP_SECONDS}s; clamping (${adjustments.join(', ')}).`
  );
  context.commandArgs = adjustedArgs;
  return false;
}

async function maybeHandleTmuxInvocation(context: RunnerExecutionContext): Promise<boolean> {
  const tokens = stripWrappersAndAssignments(context.commandArgs);
  if (tokens.length === 0) {
    return false;
  }
  const candidate = tokens[0];
  if (!candidate) {
    return false;
  }
  if (basename(candidate) !== 'tmux') {
    return false;
  }
  console.error('[runner] Detected tmux invocation; executing command without runner timeout guardrails.');
  await runCommandWithoutTimeout(context);
  return true;
}

function parseSleepDurationSeconds(token: string): number | null {
  const match = /^(\d+(?:\.\d+)?)([smhdSMHD]?)$/.exec(token);
  if (!match) {
    return null;
  }
  const value = Number(match[1]);
  if (!Number.isFinite(value)) {
    return null;
  }
  const unit = match[2]?.toLowerCase() ?? '';
  const multiplier = unit === 'm' ? 60 : unit === 'h' ? 60 * 60 : unit === 'd' ? 60 * 60 * 24 : 1;
  return value * multiplier;
}

function formatSleepArgument(seconds: number): string {
  return Number.isInteger(seconds) ? `${seconds}` : seconds.toString();
}

function formatSleepDuration(seconds: number): string {
  if (Number.isInteger(seconds)) {
    return `${seconds}s`;
  }
  return `${seconds.toFixed(2)}s`;
}

function isSleepBinary(token: string): boolean {
  return token === 'sleep' || token.endsWith('/sleep');
}

// Detects `git find` invocations that need policy enforcement.
function extractFindInvocation(commandArgs: string[]): GitInvocation | null {
  for (const [index, token] of commandArgs.entries()) {
    if (token === 'find' || token.endsWith('/find')) {
      return { index, argv: commandArgs.slice(index) };
    }
  }
  return null;
}

// Detects `git rm` variants so we can intercept destructive operations.
function extractRmInvocation(commandArgs: string[]): GitInvocation | null {
  if (commandArgs.length === 0) {
    return null;
  }

  const wrappers = new Set([
    'sudo',
    '/usr/bin/sudo',
    'env',
    '/usr/bin/env',
    'command',
    '/bin/command',
    'nohup',
    '/usr/bin/nohup',
  ]);

  let index = 0;
  while (index < commandArgs.length) {
    const token = commandArgs[index];
    if (!token) {
      break;
    }
    if (token.includes('=') && !token.startsWith('-')) {
      index += 1;
      continue;
    }
    if (wrappers.has(token)) {
      index += 1;
      continue;
    }
    break;
  }

  const commandToken = commandArgs[index];
  if (!commandToken) {
    return null;
  }

  const isRmCommand =
    commandToken === 'rm' ||
    commandToken.endsWith('/rm') ||
    commandToken === 'rm.exe' ||
    commandToken.endsWith('\\rm.exe');

  if (!isRmCommand) {
    return null;
  }

  return { index, argv: commandArgs.slice(index) };
}

// Expands guarded find expressions into an explicit delete plan for review.
async function buildFindDeletePlan(findArgs: string[], workspaceDir: string): Promise<{ paths: string[] } | null> {
  if (!findArgs.some((token) => token === '-delete')) {
    return null;
  }

  if (findArgs.some((token) => token === '-exec' || token === '-execdir' || token === '-ok' || token === '-okdir')) {
    console.error(
      'Runner cannot safely translate find invocations that combine -delete with -exec/-ok. Run the command manually after reviewing the paths.'
    );
    process.exit(1);
  }

  const printableArgs: string[] = [];
  for (const token of findArgs) {
    if (token === '-delete') {
      continue;
    }
    printableArgs.push(token);
  }
  printableArgs.push('-print0');

  const proc = Bun.spawn(printableArgs, {
    cwd: workspaceDir,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const [exitCode, stdoutBuf, stderrBuf] = await Promise.all([
    proc.exited,
    readProcessStream(proc.stdout),
    readProcessStream(proc.stderr),
  ]);

  if (exitCode !== 0) {
    const stderrText = stderrBuf.trim();
    const stdoutText = stdoutBuf.trim();
    if (stderrText.length > 0) {
      console.error(stderrText);
    } else if (stdoutText.length > 0) {
      console.error(stdoutText);
    }
    process.exit(exitCode);
  }

  const matches = stdoutBuf.split('\0').filter((entry: string) => entry.length > 0);
  if (matches.length === 0) {
    return { paths: [] };
  }

  const uniquePaths = new Map<string, string>();
  const workspaceCanonical = normalize(workspaceDir);

  for (const match of matches) {
    const absolute = isAbsolute(match) ? match : resolve(workspaceDir, match);
    const canonical = normalize(absolute);
    if (canonical === workspaceCanonical) {
      console.error('Refusing to trash the current workspace via find -delete. Narrow your find predicate.');
      process.exit(1);
    }
    if (!uniquePaths.has(canonical)) {
      uniquePaths.set(canonical, match);
    }
  }

  return { paths: Array.from(uniquePaths.values()) };
}

// Parses rm flags/targets to decide whether the runner should intervene.
function parseRmArguments(argv: string[]): { targets: string[]; force: boolean; shouldIntercept: boolean } | null {
  if (argv.length <= 1) {
    return null;
  }
  const targets: string[] = [];
  let force = false;
  let treatAsTarget = false;

  let index = 1;
  while (index < argv.length) {
    const token = argv[index];
    if (token === undefined) {
      break;
    }
    if (!treatAsTarget && token === '--') {
      treatAsTarget = true;
      index += 1;
      continue;
    }
    if (!treatAsTarget && token.startsWith('-') && token.length > 1) {
      if (token.includes('f')) {
        force = true;
      }
      if (token.includes('i') || token === '--interactive') {
        return null;
      }
      if (token === '--help' || token === '--version') {
        return null;
      }
      index += 1;
      continue;
    }
    targets.push(token);
    index += 1;
  }

  const firstTarget = targets[0];
  if (firstTarget === undefined) {
    return null;
  }

  return { targets, force, shouldIntercept: true };
}

// Generates a safe plan for git rm invocations, honoring guarded paths.
function parseGitRmArguments(argv: string[], command: GitCommandInfo): GitRmPlan | null {
  const stagingOptions: string[] = [];
  const paths: string[] = [];
  const optionsExpectingValue = new Set(['--pathspec-from-file']);
  let allowMissing = false;
  let treatAsPath = false;

  let index = command.index + 1;
  while (index < argv.length) {
    const token = argv[index];
    if (token === undefined) {
      break;
    }
    if (!treatAsPath && token === '--') {
      treatAsPath = true;
      index += 1;
      continue;
    }
    if (!treatAsPath && token.startsWith('-') && token.length > 1) {
      if (token === '--cached' || token === '--dry-run' || token === '-n') {
        return null;
      }
      if (token === '--ignore-unmatch' || token === '--force' || token === '-f') {
        allowMissing = true;
        stagingOptions.push(token);
        index += 1;
        continue;
      }
      if (optionsExpectingValue.has(token)) {
        const value = argv[index + 1];
        if (value) {
          stagingOptions.push(token, value);
          index += 2;
        } else {
          index += 1;
        }
        continue;
      }
      if (!token.startsWith('--')) {
        const flags = token.slice(1).split('');
        const retainedFlags: string[] = [];
        for (const flag of flags) {
          if (flag === 'n') {
            return null;
          }
          if (flag === 'f') {
            allowMissing = true;
            continue;
          }
          retainedFlags.push(flag);
        }
        if (retainedFlags.length > 0) {
          stagingOptions.push(`-${retainedFlags.join('')}`);
        }
        index += 1;
        continue;
      }
      stagingOptions.push(token);
      index += 1;
      continue;
    }
    if (token.length > 0) {
      paths.push(token);
    }
    index += 1;
  }

  if (paths.length === 0) {
    return null;
  }
  return {
    paths,
    stagingOptions,
    allowMissing,
    shouldIntercept: true,
  };
}

// Emits actionable messaging when git rm targets are already gone.
function reportMissingForRm(missing: string[], forced: boolean) {
  if (missing.length === 0 || forced) {
    return;
  }
  for (const path of missing) {
    console.error(`rm: ${path}: No such file or directory`);
  }
  process.exit(1);
}

// Attempts to move the provided paths into trash instead of deleting in place.
async function movePathsToTrash(
  paths: string[],
  baseDir: string,
  options: { allowMissing: boolean }
): Promise<MoveResult> {
  const missing: string[] = [];
  const existing: { raw: string; absolute: string }[] = [];

  for (const rawPath of paths) {
    const absolute = resolvePath(baseDir, rawPath);
    if (!existsSync(absolute)) {
      if (!options.allowMissing) {
        missing.push(rawPath);
      }
      continue;
    }
    existing.push({ raw: rawPath, absolute });
  }

  if (existing.length === 0) {
    return { missing, errors: [] };
  }

  const trashCliCommand = await findTrashCliCommand();
  if (trashCliCommand) {
    try {
      const cliArgs = [trashCliCommand, ...existing.map((item) => item.absolute)];
      const proc = Bun.spawn(cliArgs, {
        stdout: 'ignore',
        stderr: 'pipe',
      });
      const [exitCode, stderrText] = await Promise.all([proc.exited, readProcessStream(proc.stderr)]);
      if (exitCode === 0) {
        return { missing, errors: [] };
      }
      if (ENABLE_DEBUG_LOGS && stderrText.trim().length > 0) {
        console.error(`[runner] trash-cli error (${trashCliCommand}): ${stderrText.trim()}`);
      }
    } catch (error) {
      if (ENABLE_DEBUG_LOGS) {
        console.error(`[runner] trash-cli invocation failed: ${formatTrashError(error)}`);
      }
    }
  }

  const trashDir = getTrashDirectory();
  if (!trashDir) {
    return {
      missing,
      errors: ['Unable to locate macOS Trash directory (HOME/.Trash).'],
    };
  }

  const errors: string[] = [];

  for (const item of existing) {
    try {
      const target = buildTrashTarget(trashDir, item.absolute);
      try {
        renameSync(item.absolute, target);
      } catch (error) {
        if (isCrossDeviceError(error)) {
          cpSync(item.absolute, target, { recursive: true });
          rmSync(item.absolute, { recursive: true, force: true });
        } else {
          throw error;
        }
      }
    } catch (error) {
      errors.push(`Failed to move ${item.raw} to Trash: ${formatTrashError(error)}`);
    }
  }

  return { missing, errors };
}

// Resolves a potentially relative path against the workspace root.
function resolvePath(baseDir: string, input: string): string {
  if (input.startsWith('/')) {
    return input;
  }
  return resolve(baseDir, input);
}

// Returns the trash CLI directory if available so deletes can be safe.
function getTrashDirectory(): string | null {
  const home = process.env.HOME;
  if (!home) {
    return null;
  }
  const trash = join(home, '.Trash');
  if (!existsSync(trash)) {
    return null;
  }
  return trash;
}

// Builds the destination path inside the trash directory for a file.
function buildTrashTarget(trashDir: string, absolutePath: string): string {
  const baseName = basename(absolutePath);
  const timestamp = Date.now();
  let attempt = 0;
  let candidate = join(trashDir, baseName);
  while (existsSync(candidate)) {
    candidate = join(trashDir, `${baseName}-${timestamp}${attempt > 0 ? `-${attempt}` : ''}`);
    attempt += 1;
  }
  return candidate;
}

// Determines whether a rename failed because the devices differ.
function isCrossDeviceError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'EXDEV';
}

// Normalizes trash/rename errors into a readable string.
function formatTrashError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

// Replays a git rm plan via spawn so we can surface errors consistently.
async function stageGitRm(workDir: string, plan: GitRmPlan) {
  if (plan.paths.length === 0) {
    return;
  }
  const args = ['git', 'rm', '--cached', '--quiet', ...plan.stagingOptions, '--', ...plan.paths];
  const proc = Bun.spawn(args, {
    cwd: workDir,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`git rm --cached exited with status ${exitCode}.`);
  }
}

// Locates a usable trash CLI binary, caching the lookup per runner process.
async function findTrashCliCommand(): Promise<string | null> {
  if (cachedTrashCliCommand !== undefined) {
    return cachedTrashCliCommand;
  }

  const candidateNames = ['trash-put', 'trash'];
  const searchDirs = new Set<string>();

  if (process.env.PATH) {
    for (const segment of process.env.PATH.split(':')) {
      if (segment && segment.length > 0) {
        searchDirs.add(segment);
      }
    }
  }

  const homebrewPrefix = process.env.HOMEBREW_PREFIX ?? '/opt/homebrew';
  searchDirs.add(join(homebrewPrefix, 'opt', 'trash', 'bin'));
  searchDirs.add('/usr/local/opt/trash/bin');

  const candidatePaths = new Set<string>();
  for (const name of candidateNames) {
    candidatePaths.add(name);
    for (const dir of searchDirs) {
      candidatePaths.add(join(dir, name));
    }
  }

  for (const candidate of candidatePaths) {
    try {
      const proc = Bun.spawn([candidate, '--help'], {
        stdout: 'ignore',
        stderr: 'ignore',
      });
      const exitCode = await proc.exited;
      if (exitCode === 0 || exitCode === 1) {
        cachedTrashCliCommand = candidate;
        return candidate;
      }
    } catch (error) {
      if (ENABLE_DEBUG_LOGS) {
        console.error(`[runner] trash-cli probe failed for ${candidate}: ${formatTrashError(error)}`);
      }
    }
  }

  cachedTrashCliCommand = null;
  return null;
}

// Consumes a child process stream to completion for logging/error output.
async function readProcessStream(stream: unknown): Promise<string> {
  if (!stream) {
    return '';
  }
  try {
    const candidate = stream as { text?: () => Promise<string> };
    if (candidate.text) {
      return (await candidate.text()) ?? '';
    }
  } catch {
    // ignore
  }
  try {
    if (stream instanceof ReadableStream) {
      return await new Response(stream).text();
    }
    if (typeof stream === 'object' && stream !== null) {
      return await new Response(stream as BodyInit).text();
    }
  } catch {
    // ignore errors and return empty string
  }
  return '';
}

// Shows CLI usage plus optional error messaging.
function printUsage(message?: string) {
  if (message) {
    console.error(`[runner] ${message}`);
  }
  console.error('Usage: runner [--] <command...>');
  console.error('');
  console.error(
    `Defaults: ${formatDuration(DEFAULT_TIMEOUT_MS)} timeout for most commands, ${formatDuration(
      EXTENDED_TIMEOUT_MS
    )} when lint/test suites are detected.`
  );
}

// Pretty-prints a millisecond duration for logs.
function formatDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  const seconds = durationMs / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  if (minutes < 60) {
    if (remainingSeconds === 0) {
      return `${minutes}m`;
    }
    return `${minutes}m ${remainingSeconds}s`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${remainingMinutes}m`;
}

function resolveSummaryStyle(rawValue: string | undefined | null): SummaryStyle {
  if (!rawValue) {
    return 'compact';
  }
  const normalized = rawValue.trim().toLowerCase();
  switch (normalized) {
    case 'minimal':
      return 'minimal';
    case 'verbose':
      return 'verbose';
    case 'compact':
    case 'short':
    default:
      return 'compact';
  }
}

function formatCompletionSummary(options: {
  exitCode: number;
  elapsedMs?: number;
  timedOut?: boolean;
  commandLabel: string;
}): string {
  const { exitCode, elapsedMs, timedOut, commandLabel } = options;
  const durationText = typeof elapsedMs === 'number' ? formatDuration(elapsedMs) : null;
  switch (SUMMARY_STYLE) {
    case 'minimal': {
      const parts = [`${exitCode}`];
      if (durationText) {
        parts.push(durationText);
      }
      if (timedOut) {
        parts.push('timeout');
      }
      return `[runner] ${parts.join(' · ')}`;
    }
    case 'verbose': {
      const elapsedPart = durationText ? `, elapsed ${durationText}` : '';
      const timeoutPart = timedOut ? '; timed out' : '';
      return `[runner] Finished ${commandLabel} (exit ${exitCode}${elapsedPart}${timeoutPart}).`;
    }
    case 'compact':
    default: {
      const elapsedPart = durationText ? ` in ${durationText}` : '';
      const timeoutPart = timedOut ? ' (timeout)' : '';
      return `[runner] exit ${exitCode}${elapsedPart}${timeoutPart}`;
    }
  }
}

// Joins the command args in a shell-friendly way for log display.
function formatDisplayCommand(commandArgs: string[]): string {
  return commandArgs.map((token) => (token.includes(' ') ? `"${token}"` : token)).join(' ');
}

// Tells whether the runner is already executing inside the tmux guard.
function isRunnerTmuxSession(): boolean {
  const value = process.env.RUNNER_TMUX;
  if (value) {
    return value !== '0' && value.toLowerCase() !== 'false';
  }
  return Boolean(process.env.TMUX);
}

[FILE: ../Peekaboo/scripts/build-peekaboo-cli.sh]
#!/bin/bash
set -e

echo "Building Swift CLI..."

# Change to CLI directory
cd "$(dirname "$0")/../Apps/CLI"

# Build the Swift CLI in release mode
swift build --configuration release

# Copy the binary to the root directory
cp .build/release/peekaboo ../peekaboo

# Make it executable
chmod +x ../peekaboo

echo "Swift CLI built successfully and copied to ./peekaboo"

[FILE: ../Peekaboo/scripts/tmux-build.sh]
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_PATH=${CLI_BUILD_LOG:-/tmp/cli-build.log}
EXIT_PATH=${CLI_BUILD_EXIT:-/tmp/cli-build.exit}
BUILD_PATH=${CLI_BUILD_DIR:-/tmp/peekaboo-cli-build}

write_exit_code() {
  local status=${1:-$?}
  mkdir -p "$(dirname "$EXIT_PATH")"
  printf "%s" "$status" > "$EXIT_PATH"
}
trap 'write_exit_code $?' EXIT

mkdir -p "$(dirname "$LOG_PATH")"
rm -f "$LOG_PATH" "$EXIT_PATH"

cd "$ROOT_DIR"

set +e
swift build --package-path Apps/CLI --build-path "$BUILD_PATH" "$@" 2>&1 | tee "$LOG_PATH"
BUILD_STATUS=${PIPESTATUS[0]}
set -e

exit "$BUILD_STATUS"

[FILE: ../Peekaboo/scripts/git-policy.ts]
import { resolve } from 'node:path';

export type GitInvocation = {
  index: number;
  argv: string[];
};

export type GitCommandInfo = {
  name: string;
  index: number;
};

export type GitExecutionContext = {
  invocation: GitInvocation | null;
  command: GitCommandInfo | null;
  subcommand: string | null;
  workDir: string;
};

export type GitPolicyEvaluation = {
  requiresCommitHelper: boolean;
  requiresExplicitConsent: boolean;
  isDestructive: boolean;
};

const COMMIT_HELPER_SUBCOMMANDS = new Set(['add', 'commit']);
const GUARDED_SUBCOMMANDS = new Set(['push', 'pull', 'merge', 'rebase', 'cherry-pick']);
const DESTRUCTIVE_SUBCOMMANDS = new Set([
  'reset',
  'checkout',
  'clean',
  'restore',
  'switch',
  'stash',
  'branch',
  'filter-branch',
  'fast-import',
]);

export function extractGitInvocation(commandArgs: string[]): GitInvocation | null {
  for (const [index, token] of commandArgs.entries()) {
    if (token === 'git' || token.endsWith('/git')) {
      return { index, argv: commandArgs.slice(index) };
    }
  }
  return null;
}

export function findGitSubcommand(commandArgs: string[]): GitCommandInfo | null {
  if (commandArgs.length <= 1) {
    return null;
  }

  const optionsWithValue = new Set(['-C', '--git-dir', '--work-tree', '-c']);
  let index = 1;

  while (index < commandArgs.length) {
    const token = commandArgs[index];
    if (token === '--') {
      const next = commandArgs[index + 1];
      return next ? { name: next, index: index + 1 } : null;
    }
    if (!token.startsWith('-')) {
      return { name: token, index };
    }
    if (token.includes('=')) {
      index += 1;
      continue;
    }
    if (optionsWithValue.has(token)) {
      index += 2;
      continue;
    }
    index += 1;
  }
  return null;
}

export function determineGitWorkdir(baseDir: string, gitArgs: string[], command: GitCommandInfo | null): string {
  let workDir = baseDir;
  const limit = command ? command.index : gitArgs.length;
  let index = 1;

  while (index < limit) {
    const token = gitArgs[index];
    if (token === '-C') {
      const next = gitArgs[index + 1];
      if (next) {
        workDir = resolve(workDir, next);
      }
      index += 2;
      continue;
    }
    if (token.startsWith('-C')) {
      const pathSegment = token.slice(2);
      if (pathSegment.length > 0) {
        workDir = resolve(workDir, pathSegment);
      }
    }
    index += 1;
  }

  return workDir;
}

export function analyzeGitExecution(commandArgs: string[], workspaceDir: string): GitExecutionContext {
  const invocation = extractGitInvocation(commandArgs);
  const command = invocation ? findGitSubcommand(invocation.argv) : null;
  const workDir = invocation ? determineGitWorkdir(workspaceDir, invocation.argv, command) : workspaceDir;

  return {
    invocation,
    command,
    subcommand: command?.name ?? null,
    workDir,
  };
}

export function requiresCommitHelper(subcommand: string | null): boolean {
  if (!subcommand) {
    return false;
  }
  return COMMIT_HELPER_SUBCOMMANDS.has(subcommand);
}

export function requiresExplicitGitConsent(subcommand: string | null): boolean {
  if (!subcommand) {
    return false;
  }
  return GUARDED_SUBCOMMANDS.has(subcommand);
}

export function isDestructiveGitSubcommand(command: GitCommandInfo | null, gitArgv: string[]): boolean {
  if (!command) {
    return false;
  }

  const subcommand = command.name;
  if (DESTRUCTIVE_SUBCOMMANDS.has(subcommand)) {
    return true;
  }

  if (subcommand === 'bisect') {
    const action = gitArgv[command.index + 1] ?? '';
    return action === 'reset';
  }

  return false;
}

export function evaluateGitPolicies(context: GitExecutionContext): GitPolicyEvaluation {
  const invocationArgv = context.invocation?.argv;
  const normalizedArgv = Array.isArray(invocationArgv) ? invocationArgv : [];
  return {
    requiresCommitHelper: requiresCommitHelper(context.subcommand),
    requiresExplicitConsent: requiresExplicitGitConsent(context.subcommand),
    isDestructive: isDestructiveGitSubcommand(context.command, normalizedArgv),
  };
}

