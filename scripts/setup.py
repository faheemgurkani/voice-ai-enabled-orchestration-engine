#!/usr/bin/env python3
"""
Voice AI Enabled Orchestration Engine (Gawah) — cross-platform setup & run helper (macOS · Windows · Linux).

Originated at Uplift AI × Replit Voice AI Hackathon (2026). Product: Gawah (گواہ).

Usage (from repo root):
  python scripts/setup.py              # install everything
  python scripts/setup.py install      # same
  python scripts/setup.py check        # verify tools + env
  python scripts/setup.py seed         # load demo dashboard data
  python scripts/setup.py dev          # start API + frontend
  python scripts/setup.py backend      # API only
  python scripts/setup.py frontend     # Vite UI only

Windows:
  py -3 scripts\\setup.py install
  .\\scripts\\setup.ps1 install

macOS / Linux:
  ./scripts/setup.sh install
"""

from __future__ import annotations

import argparse
import os
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "gawah-backend"
FRONTEND_WS = ROOT / "frontend"
FRONTEND_APP = FRONTEND_WS / "artifacts" / "gawah-frontend"
VENV = ROOT / ".venv"
IS_WIN = os.name == "nt"

MIN_PYTHON = (3, 10)
MIN_NODE_MAJOR = 18


# ── helpers ──────────────────────────────────────────────────────────────────

def _c(msg: str) -> None:
    print(msg, flush=True)


def _ok(msg: str) -> None:
    print(f"  ✓ {msg}", flush=True)


def _warn(msg: str) -> None:
    print(f"  ! {msg}", flush=True)


def _die(msg: str, code: int = 1) -> None:
    print(f"\nERROR: {msg}", file=sys.stderr, flush=True)
    raise SystemExit(code)


def venv_python() -> Path:
    if IS_WIN:
        return VENV / "Scripts" / "python.exe"
    return VENV / "bin" / "python"


def venv_bin(name: str) -> Path:
    if IS_WIN:
        return VENV / "Scripts" / (name + (".exe" if not name.endswith(".exe") else ""))
    return VENV / "bin" / name


def run(
    cmd: list[str],
    *,
    cwd: Path | None = None,
    env: dict | None = None,
    check: bool = True,
) -> subprocess.CompletedProcess:
    _c(f"  $ {' '.join(cmd)}")
    return subprocess.run(
        cmd,
        cwd=str(cwd or ROOT),
        env=env,
        check=check,
    )


def which(cmd: str) -> str | None:
    return shutil.which(cmd)


def copy_if_missing(src: Path, dest: Path) -> bool:
    if dest.exists():
        return False
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, dest)
    return True


def read_dotenv(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not path.exists():
        return out
    for line in path.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if not s or s.startswith("#") or "=" not in s:
            continue
        k, _, v = s.partition("=")
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def key_present(env_map: dict[str, str], key: str) -> bool:
    v = env_map.get(key, "").strip()
    return bool(v)


# ── checks ───────────────────────────────────────────────────────────────────

def check_python() -> None:
    if sys.version_info < MIN_PYTHON:
        _die(f"Python {MIN_PYTHON[0]}.{MIN_PYTHON[1]}+ required (found {sys.version.split()[0]})")
    _ok(f"Python {sys.version.split()[0]}")


def check_node() -> str:
    node = which("node")
    if not node:
        _die("Node.js not found. Install Node 18+ from https://nodejs.org/")
    try:
        out = subprocess.check_output([node, "-v"], text=True).strip().lstrip("v")
        major = int(out.split(".")[0])
    except Exception as exc:  # noqa: BLE001
        _die(f"Could not read node version: {exc}")
    if major < MIN_NODE_MAJOR:
        _die(f"Node.js {MIN_NODE_MAJOR}+ required (found v{out})")
    _ok(f"Node.js v{out}")
    return node


def ensure_pnpm() -> str:
    pnpm = which("pnpm")
    if pnpm:
        ver = subprocess.check_output([pnpm, "-v"], text=True).strip()
        _ok(f"pnpm {ver}")
        return pnpm

    _warn("pnpm not found — enabling via corepack…")
    corepack = which("corepack")
    if corepack:
        run([corepack, "enable"], check=False)
        run([corepack, "prepare", "pnpm@latest", "--activate"], check=False)
        pnpm = which("pnpm")
        if pnpm:
            _ok(f"pnpm via corepack ({subprocess.check_output([pnpm, '-v'], text=True).strip()})")
            return pnpm

    _warn("Trying: npm install -g pnpm")
    npm = which("npm")
    if not npm:
        _die("Neither pnpm nor npm found. Install Node.js, then: npm i -g pnpm")
    run([npm, "install", "-g", "pnpm"])
    pnpm = which("pnpm")
    if not pnpm:
        _die("pnpm install failed. Install manually: npm i -g pnpm")
    _ok(f"pnpm {subprocess.check_output([pnpm, '-v'], text=True).strip()}")
    return pnpm


def cmd_check(_: argparse.Namespace) -> None:
    _c("\n== Prerequisites ==")
    check_python()
    check_node()
    ensure_pnpm()

    _c("\n== Project paths ==")
    for label, path in [
        ("backend", BACKEND),
        ("frontend workspace", FRONTEND_WS),
        ("gawah UI", FRONTEND_APP),
        ("venv", VENV),
    ]:
        if path.exists():
            _ok(f"{label}: {path}")
        else:
            _warn(f"{label} missing: {path}")

    _c("\n== Environment files ==")
    root_env = ROOT / ".env"
    be_env = BACKEND / ".env"
    fe_env = FRONTEND_APP / ".env"
    for p in (root_env, be_env, fe_env):
        if p.exists():
            _ok(f"{p.relative_to(ROOT)}")
        else:
            _warn(f"missing {p.relative_to(ROOT)} (will be created on install)")

    merged = {}
    merged.update(read_dotenv(root_env))
    merged.update(read_dotenv(be_env))

    _c("\n== API keys (for live voice / phone) ==")
    for key, note in [
        ("UPLIFTAI_API_KEY", "required for live WebRTC + PSTN"),
        ("UPLIFT_ASSISTANT_ID", "optional — backend can create one"),
        ("OPENROUTER_API_KEY", "recommended for structuring / consistency"),
    ]:
        if key_present(merged, key):
            _ok(f"{key} set")
        else:
            _warn(f"{key} empty — {note}")

    if VENV.exists() and venv_python().exists():
        _ok(f"venv ready ({venv_python()})")
    else:
        _warn("venv not created yet — run: python scripts/setup.py install")

    _c("\nCheck complete.\n")


# ── install ──────────────────────────────────────────────────────────────────

def ensure_venv() -> Path:
    py = venv_python()
    if py.exists():
        _ok(f"venv exists → {py}")
        return py

    _c("Creating virtualenv at .venv …")
    run([sys.executable, "-m", "venv", str(VENV)])
    if not venv_python().exists():
        _die("Failed to create .venv")
    _ok(f"venv created → {venv_python()}")
    return venv_python()


def install_backend(py: Path) -> None:
    req = BACKEND / "requirements.txt"
    if not req.exists():
        _die(f"Missing {req}")
    _c("\n== Backend Python deps ==")
    run([str(py), "-m", "pip", "install", "--upgrade", "pip"])
    run([str(py), "-m", "pip", "install", "-r", str(req)])
    _ok("backend requirements installed")


def install_frontend(pnpm: str) -> None:
    _c("\n== Frontend (pnpm workspace) ==")
    if not (FRONTEND_WS / "pnpm-workspace.yaml").exists():
        _die(f"Missing frontend workspace at {FRONTEND_WS}")
    # Prefer frozen lockfile when present; fall back if out of sync
    r = run([pnpm, "install", "--frozen-lockfile"], cwd=FRONTEND_WS, check=False)
    if r.returncode != 0:
        _warn("frozen lockfile install failed — retrying without --frozen-lockfile")
        run([pnpm, "install"], cwd=FRONTEND_WS)
    _ok("frontend dependencies installed")


def ensure_env_files() -> None:
    _c("\n== Environment files ==")
    pairs = [
        (ROOT / ".env.example", ROOT / ".env"),
        (BACKEND / ".env.example", BACKEND / ".env"),
        (FRONTEND_APP / ".env.example", FRONTEND_APP / ".env"),
    ]
    for src, dest in pairs:
        if not src.exists():
            _warn(f"no template {src.relative_to(ROOT)}")
            continue
        if copy_if_missing(src, dest):
            _ok(f"created {dest.relative_to(ROOT)} from example")
        else:
            _ok(f"kept existing {dest.relative_to(ROOT)}")

    # Sync useful keys from root .env → backend .env when backend key empty
    root = read_dotenv(ROOT / ".env")
    be_path = BACKEND / ".env"
    be = read_dotenv(be_path)
    sync_keys = [
        "UPLIFTAI_API_KEY",
        "UPLIFT_ASSISTANT_ID",
        "UPLIFT_BASE_URL",
        "OPENROUTER_API_KEY",
        "OPENROUTER_MODEL",
        "CORS_ORIGINS",
        "CASE_ID_SECRET",
    ]
    changed = False
    lines = be_path.read_text(encoding="utf-8").splitlines() if be_path.exists() else []
    for key in sync_keys:
        if key_present(be, key) or not key_present(root, key):
            continue
        # append or replace empty assignment
        replaced = False
        for i, line in enumerate(lines):
            if line.startswith(f"{key}="):
                lines[i] = f"{key}={root[key]}"
                replaced = True
                break
        if not replaced:
            lines.append(f"{key}={root[key]}")
        changed = True
        _ok(f"synced {key} → gawah-backend/.env")
    if changed:
        be_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def cmd_install(args: argparse.Namespace) -> None:
    _c("\n╔══════════════════════════════════════╗")
    _c("║  Voice AI Orchestration Engine (Gawah)  ║")
    _c("║         local setup (install)           ║")
    _c("╚══════════════════════════════════════╝")
    _c(f"OS: {sys.platform}  |  repo: {ROOT}\n")

    check_python()
    check_node()
    pnpm = ensure_pnpm()

    py = ensure_venv()
    install_backend(py)
    ensure_env_files()
    install_frontend(pnpm)

    if not args.no_seed:
        _c("\n== Demo seed ==")
        cmd_seed(args)
    else:
        _warn("skipped seed (--no-seed)")

    _c("\n══════════════════════════════════════")
    _c("Setup complete.")
    _c("")
    _c("1. Put API keys in gawah-backend/.env (and/or root .env):")
    _c("     UPLIFTAI_API_KEY=…")
    _c("     OPENROUTER_API_KEY=…   # recommended")
    _c("")
    _c("2. Start both servers:")
    if IS_WIN:
        _c("     py -3 scripts\\setup.py dev")
        _c("     # or:  .\\scripts\\setup.ps1 dev")
    else:
        _c("     python scripts/setup.py dev")
        _c("     # or:  ./scripts/setup.sh dev")
    _c("")
    _c("3. Open http://127.0.0.1:5173")
    _c("     API docs: http://127.0.0.1:8000/docs")
    _c("══════════════════════════════════════\n")


# ── seed ─────────────────────────────────────────────────────────────────────

def cmd_seed(_: argparse.Namespace) -> None:
    py = venv_python()
    if not py.exists():
        _die("venv missing — run: python scripts/setup.py install")
    script = BACKEND / "scripts" / "seed_demo.py"
    if not script.exists():
        _die(f"Missing {script}")
    _c("Seeding demo statements / cluster / calls …")
    run([str(py), str(script), "--replace"], cwd=BACKEND)
    _ok("demo data ready (open Dashboard → NBRA7K)")


# ── run servers ──────────────────────────────────────────────────────────────

def _backend_cmd(py: Path) -> list[str]:
    # Always launch via `python -m uvicorn` rather than the venv's uvicorn
    # binary directly: a space anywhere in the repo path (e.g. "Misc.
    # Projects") breaks the shebang line pip writes into that binary, which
    # then fails with a misleading FileNotFoundError on exec.
    return [
        str(py),
        "-m",
        "uvicorn",
        "app.main:app",
        "--app-dir",
        str(BACKEND),
        "--reload",
        "--host",
        "0.0.0.0",
        "--port",
        "8000",
    ]


def _frontend_cmd(pnpm: str) -> list[str]:
    # PORT / BASE_PATH consumed by vite.config.ts
    return [pnpm, "dev", "--host", "127.0.0.1"]


def _spawn(cmd: list[str], *, cwd: Path, env: dict | None = None) -> subprocess.Popen:
    merged = os.environ.copy()
    if env:
        merged.update(env)
    _c(f"  $ {' '.join(cmd)}   (cwd={cwd})")
    # Run each server in its own process group so shutdown can reach
    # grandchildren too (e.g. `pnpm dev` spawns `vite` as a child process;
    # terminating just the pnpm PID can leave vite running and squatting the
    # port for the next run). Not available on Windows — falls back to the
    # default (best-effort) there.
    kwargs = {}
    if os.name != "nt":
        kwargs["start_new_session"] = True
    else:
        kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
    return subprocess.Popen(cmd, cwd=str(cwd), env=merged, **kwargs)


def _stop_proc(p: subprocess.Popen, *, timeout: float = 5.0) -> None:
    """Terminate a process and its whole process group, escalating to kill."""
    if p.poll() is not None:
        return
    try:
        if os.name != "nt":
            os.killpg(os.getpgid(p.pid), signal.SIGTERM)
        else:
            p.send_signal(signal.CTRL_BREAK_EVENT)
    except (ProcessLookupError, OSError):
        pass
    deadline = time.time() + timeout
    while p.poll() is None and time.time() < deadline:
        time.sleep(0.1)
    if p.poll() is None:
        try:
            if os.name != "nt":
                os.killpg(os.getpgid(p.pid), signal.SIGKILL)
            else:
                p.kill()
        except (ProcessLookupError, OSError):
            pass
        p.wait(timeout=5)


def cmd_backend(_: argparse.Namespace) -> None:
    py = venv_python()
    if not py.exists():
        _die("venv missing — run install first")
    ensure_env_files()
    _c("\nStarting FastAPI on http://127.0.0.1:8000 …\n")
    raise SystemExit(subprocess.call(_backend_cmd(py), cwd=str(ROOT)))


def cmd_frontend(_: argparse.Namespace) -> None:
    pnpm = ensure_pnpm()
    ensure_env_files()
    env = {
        "PORT": "5173",
        "BASE_PATH": "/",
        "VITE_API_PROXY_TARGET": "http://localhost:8000",
    }
    _c("\nStarting Vite UI on http://127.0.0.1:5173 …\n")
    raise SystemExit(
        subprocess.call(_frontend_cmd(pnpm), cwd=str(FRONTEND_APP), env={**os.environ, **env})
    )


def cmd_dev(_: argparse.Namespace) -> None:
    py = venv_python()
    if not py.exists():
        _die("venv missing — run: python scripts/setup.py install")
    pnpm = ensure_pnpm()
    ensure_env_files()

    fe_env = {
        "PORT": "5173",
        "BASE_PATH": "/",
        "VITE_API_PROXY_TARGET": "http://localhost:8000",
    }

    _c("\n╔══════════════════════════════════════╗")
    _c("║  Voice AI Orchestration Engine (Gawah)  ║")
    _c("║       dev (API + frontend)              ║")
    _c("╚══════════════════════════════════════╝")
    _c("  API  → http://127.0.0.1:8000/docs")
    _c("  UI   → http://127.0.0.1:5173")
    _c("  Ctrl+C to stop both\n")

    procs: list[subprocess.Popen] = []
    try:
        procs.append(_spawn(_backend_cmd(py), cwd=ROOT))
        time.sleep(1.2)
        procs.append(_spawn(_frontend_cmd(pnpm), cwd=FRONTEND_APP, env=fe_env))
        # Wait until either exits
        while True:
            for p in procs:
                code = p.poll()
                if code is not None:
                    _warn(f"process exited with {code}: {p.args}")
                    raise SystemExit(code or 0)
            time.sleep(0.4)
    except KeyboardInterrupt:
        _c("\nStopping…")
    finally:
        # Stop both servers (and their child processes, e.g. vite under
        # pnpm) whether we got here via Ctrl+C or because one of them died —
        # a still-running sibling must never be left orphaned holding its
        # port for the next run.
        for p in procs:
            _stop_proc(p)
        _c("Stopped.\n")


# ── cli ──────────────────────────────────────────────────────────────────────

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Voice AI Enabled Orchestration Engine (Gawah) — local setup (macOS / Windows / Linux)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    p.add_argument(
        "command",
        nargs="?",
        default="install",
        choices=["install", "check", "seed", "dev", "backend", "frontend"],
        help="action to run (default: install)",
    )
    p.add_argument(
        "--no-seed",
        action="store_true",
        help="skip demo data seed during install",
    )
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    os.chdir(ROOT)

    handlers = {
        "install": cmd_install,
        "check": cmd_check,
        "seed": cmd_seed,
        "dev": cmd_dev,
        "backend": cmd_backend,
        "frontend": cmd_frontend,
    }
    try:
        handlers[args.command](args)
    except subprocess.CalledProcessError as exc:
        _die(f"command failed ({exc.returncode}): {' '.join(exc.cmd)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
