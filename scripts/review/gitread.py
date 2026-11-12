"""Read worktrees, rounds and old files from git. Never uses a shell."""
import re
import subprocess

HIDDEN = (".git", ".review", ".reels", "node_modules", "__pycache__")

_BRANCH_RE = re.compile(r"^[A-Za-z0-9._/-]{1,100}$")


def _git(cwd, *args):
    # safe.directory: the container user differs from the mount owner in some setups.
    try:
        return subprocess.run(
            ["git", "-c", "safe.directory=*", *args],
            cwd=cwd, capture_output=True, text=True, timeout=5,
        )
    except (subprocess.TimeoutExpired, FileNotFoundError, ValueError):
        return subprocess.CompletedProcess(args, 1, "", "")


def worktrees(main):
    out = _git(main, "worktree", "list", "--porcelain").stdout
    result = []
    for block in out.split("\n\n"):
        path = branch = None
        for line in block.splitlines():
            if line.startswith("worktree "):
                path = line[len("worktree "):]
            elif line.startswith("branch refs/heads/"):
                branch = line[len("branch refs/heads/"):]
        if path and branch:
            result.append({"branch": branch, "path": path})
    return result


def rounds(main, branch, base="master"):
    if base.startswith("-") or branch.startswith("-"):
        return []
    res = _git(main, "log", "--reverse", "--format=%H%x00%s", "--end-of-options", base + ".." + branch, "--")
    if res.returncode != 0:
        return []
    result = []
    for line in res.stdout.splitlines():
        sha, _, subject = line.partition("\x00")
        result.append({"n": len(result) + 1, "sha": sha, "subject": subject})
    return result


def dirty(path):
    res = _git(path, "status", "--porcelain")
    if res.returncode != 0:
        return True  # fail closed: an unknown state counts as dirty
    for line in res.stdout.splitlines():
        name = line[3:].split(" -> ")[-1].strip('"')
        if line.startswith("??") and name.split("/")[0] in HIDDEN:
            continue
        return True
    return False


def head(path):
    """{branch, commit} of the checkout at path. A value is None if git cannot tell."""
    branch = _git(path, "symbolic-ref", "--short", "-q", "HEAD")
    commit = _git(path, "rev-parse", "--short=7", "HEAD")
    return {"branch": branch.stdout.strip() or None if branch.returncode == 0 else None,
            "commit": commit.stdout.strip() or None if commit.returncode == 0 else None}


def show(main, rev, path):
    if rev.startswith("-"):
        return None
    res = _git(main, "show", "--end-of-options", rev + ":" + path)
    return res.stdout if res.returncode == 0 else None


def valid_branch(name):
    if not _BRANCH_RE.match(name) or ".." in name or name.startswith("-"):
        return False
    return _git(None, "check-ref-format", "--branch", name).returncode == 0


def valid_path(path):
    if not path or path.startswith("/"):
        return False
    if any(ord(c) < 0x20 or ord(c) == 0x7F for c in path):
        return False
    parts = path.split("/")
    return not any(p == ".." or p in HIDDEN for p in parts)
