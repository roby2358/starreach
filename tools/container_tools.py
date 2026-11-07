#!/usr/bin/env python3
"""Re-grabs the tools a rebuilt dev container lacks, with no root needed.

Rust needs a C linker to build its tests, and headless Chromium needs system libraries. Each is
fetched only when missing, into TOOLS outside the repo:
- the linker: Zig's `zig cc` from its PyPI wheel, wired in through ~/.cargo/config.toml;
- the libraries: Debian packages unpacked, with an env file that `just cc-test-page` sources.
"""

import glob
import gzip
import io
import json
import os
import re
import shutil
import stat
import subprocess
import urllib.request
import zipfile
from pathlib import Path

TOOLS = Path.home() / ".local/share/starreach-tools"
CARGO_CONFIG = Path.home() / ".cargo/config.toml"
HEADLESS_SHELL = "~/.cache/ms-playwright/chromium_headless_shell-*/*/chrome-headless-shell"

DEBIAN = "https://deb.debian.org/debian/"
DEBIAN_INDEX = DEBIAN + "dists/bookworm/main/binary-amd64/Packages.gz"
CHROMIUM_PACKAGES = [
    "libglib2.0-0", "libnspr4", "libnss3", "libatk1.0-0", "libatk-bridge2.0-0", "libdbus-1-3",
    "libx11-6", "libxcomposite1", "libxdamage1", "libxext6", "libxfixes3", "libxrandr2", "libgbm1",
    "libxcb1", "libxkbcommon0", "libasound2", "libatspi2.0-0", "libfontconfig1", "fontconfig-config",
    "libfreetype6", "fonts-dejavu-core",
]
ALREADY_PRESENT = {"libc6", "libgcc-s1", "libstdc++6", "debconf", "dpkg", "zlib1g"}

ZIG_RELEASE = "https://pypi.org/pypi/ziglang/0.17.1/json"
# Flags for GNU cc that zig cc rejects or supplies itself.
ZIG_DROPPED_FLAGS = (
    "-Wl,--as-needed|-Wl,--eh-frame-hdr|-Wl,-z,noexecstack|-nodefaultlibs|-m64"
    "|-fuse-ld=lld|-B*gcc-ld|-Wl,-Bstatic|-Wl,-Bdynamic"
)


def install_linker() -> None:
    if shutil.which("cc") is not None:
        print("C linker: cc is present")
        return
    release = json.load(urllib.request.urlopen(ZIG_RELEASE))
    wheel = next(f for f in release["urls"] if "manylinux" in f["filename"] and "x86_64" in f["filename"])
    print(f"C linker: fetching {wheel['filename']}")
    data = urllib.request.urlopen(wheel["url"]).read()
    zipfile.ZipFile(io.BytesIO(data)).extractall(TOOLS / "zig")
    zig = TOOLS / "zig/ziglang/zig"
    zig.chmod(zig.stat().st_mode | stat.S_IXUSR)
    wrapper = TOOLS / "zigcc"
    wrapper.write_text(
        "#!/bin/bash\nargs=()\n"
        'for a in "$@"; do case "$a" in\n'
        '  -lgcc_s) args+=("-lunwind");;\n'
        f"  {ZIG_DROPPED_FLAGS}) ;;\n"
        '  *) args+=("$a");;\nesac; done\n'
        f'exec {zig} cc -target x86_64-linux-gnu "${{args[@]}}"\n'
    )
    wrapper.chmod(0o755)
    CARGO_CONFIG.write_text(f'[target.x86_64-unknown-linux-gnu]\nlinker = "{wrapper}"\n')
    print(f"C linker: wrote {CARGO_CONFIG}")


def missing_libraries(binary: str) -> list[str]:
    output = subprocess.run(["ldd", binary], capture_output=True, text=True, check=True).stdout
    return [line.split()[0] for line in output.splitlines() if "not found" in line]


def debian_packages() -> dict[str, dict[str, str]]:
    text = gzip.decompress(urllib.request.urlopen(DEBIAN_INDEX).read()).decode()
    fields = (dict(re.findall(r"^([A-Za-z-]+): (.*)$", block, re.M)) for block in text.split("\n\n"))
    return {f["Package"]: f for f in fields if "Package" in f}


def with_dependencies(wanted: list[str], packages: dict[str, dict[str, str]]) -> set[str]:
    seen: set[str] = set()
    queue = list(wanted)
    while queue:
        name = queue.pop()
        if name in seen or name in ALREADY_PRESENT or name not in packages:
            continue
        seen.add(name)
        depends = packages[name].get("Depends", "")
        queue += [dep.split("|")[0].split()[0].split(":")[0] for dep in depends.split(", ") if dep]
    return seen


def install_chromium_libraries() -> None:
    binaries = glob.glob(os.path.expanduser(HEADLESS_SHELL))
    if not binaries:
        raise SystemExit(f"No headless Chromium at {HEADLESS_SHELL}. Run: npx playwright-core install chromium-headless-shell")
    if not missing_libraries(binaries[0]):
        print("Chromium libraries: present")
        return
    packages = debian_packages()
    root = TOOLS / "chromium-libs"
    names = sorted(with_dependencies(CHROMIUM_PACKAGES, packages))
    print(f"Chromium libraries: fetching {len(names)} packages")
    for name in names:
        deb = TOOLS / "package.deb"
        urllib.request.urlretrieve(DEBIAN + packages[name]["Filename"], deb)
        subprocess.run(["dpkg-deb", "-x", str(deb), str(root)], check=True)
        deb.unlink()
    fonts = TOOLS / "fonts.conf"
    fonts.write_text(
        f'<?xml version="1.0"?><fontconfig><dir>{root}/usr/share/fonts</dir>'
        f"<cachedir>{TOOLS}/fontcache</cachedir></fontconfig>\n"
    )
    (TOOLS / "env").write_text(
        f"export LD_LIBRARY_PATH={root}/usr/lib/x86_64-linux-gnu:{root}/lib/x86_64-linux-gnu\n"
        f"export FONTCONFIG_FILE={fonts}\n"
    )
    still_missing = subprocess.run(
        ["bash", "-c", f". {TOOLS}/env; ldd {binaries[0]} | grep 'not found' || true"],
        capture_output=True, text=True, check=True,
    ).stdout
    if still_missing:
        raise SystemExit(f"Still missing:\n{still_missing}")


def main() -> None:
    TOOLS.mkdir(parents=True, exist_ok=True)
    install_linker()
    install_chromium_libraries()


main()
