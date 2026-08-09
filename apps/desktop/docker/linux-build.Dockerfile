# Task 14.1's own tool for producing real Linux installer artifacts
# (.deb, .AppImage) from a macOS development machine — native compilation
# inside a real Linux container, not cross-compilation. There is no
# equivalent for Windows: Docker Desktop on macOS cannot run Windows
# containers, and there is no MSVC cross-toolchain on this machine, so a
# real .exe/.msi still needs an actual Windows host or CI runner (task
# 14.4's own future job, not something this Dockerfile can stand in for).
#
# This is the same system-package list Tauri v2's own Linux prerequisites
# document, plus cmake for llama-cpp-sys-2 (task 12.2's inference engine),
# on a Debian bookworm base matching this repo's own `engines.node: >=24`.
#
# Usage (from the repo root):
#   docker build -f apps/desktop/docker/linux-build.Dockerfile -t sovereign-edge-linux-build .
#   docker run --rm \
#     -v "$(pwd):/workspace" \
#     -v sovereign-edge-linux-cargo:/root/.cargo/registry \
#     -v sovereign-edge-linux-nm-root:/workspace/node_modules \
#     -v sovereign-edge-linux-nm-desktop:/workspace/apps/desktop/node_modules \
#     -v sovereign-edge-linux-nm-mobile:/workspace/apps/mobile/node_modules \
#     -v sovereign-edge-linux-nm-dtokens:/workspace/packages/design-tokens/node_modules \
#     -v sovereign-edge-linux-nm-dui:/workspace/packages/desktop-ui/node_modules \
#     -e CI=true \
#     sovereign-edge-linux-build
#
# The node_modules volumes are required, not optional: bind-mounting the
# whole repo (`-v "$(pwd):/workspace"`) also brings the host's macOS-native
# node_modules into the Linux container. Without a volume shadowing each
# package's node_modules, the container's Linux-native `pnpm install` would
# overwrite the host's own macOS-native node_modules through the shared
# bind mount, breaking the host's dev environment. `target/` is deliberately
# *not* isolated the same way: this build is native (not cross-compiled), so
# a Linux container writes Linux ELF binaries into
# apps/desktop/src-tauri/target/release/ — the same path a macOS build on
# the host uses. Run a macOS `pnpm tauri build` again afterward (or `cargo
# clean`) before trusting target/release/ contents on the host again if this
# matters for what you're doing next.

FROM node:24-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    wget \
    file \
    cmake \
    clang \
    libclang-dev \
    libwebkit2gtk-4.1-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    patchelf \
    libssl-dev \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
ENV PATH="/root/.cargo/bin:${PATH}"

RUN npm install -g pnpm@11.5.2

# AppImage bundling needs FUSE to run the downloaded linuxdeploy/appimagetool
# AppImages themselves; containers usually can't mount FUSE without extra
# `--device`/`--cap-add` flags, so this is the documented workaround —
# extract-and-run instead of mounting.
ENV APPIMAGE_EXTRACT_AND_RUN=1

WORKDIR /workspace

CMD ["bash", "-lc", "pnpm install --frozen-lockfile && pnpm --filter desktop exec tauri build"]
