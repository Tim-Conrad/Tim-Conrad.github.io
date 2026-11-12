import os
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gitread


def git(cwd, *args):
    subprocess.run(
        ["git", "-c", "user.name=t", "-c", "user.email=t@t", *args],
        cwd=cwd, check=True, capture_output=True,
    )


class GitReadTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        root = os.path.realpath(cls.tmp.name)
        cls.main = os.path.join(root, "main")
        cls.wt = os.path.join(root, "wt")
        os.mkdir(cls.main)
        git(cls.main, "init", "-b", "master")
        with open(os.path.join(cls.main, "a.txt"), "w") as f:
            f.write("old\n")
        git(cls.main, "add", "a.txt")
        git(cls.main, "commit", "-m", "base")
        git(cls.main, "worktree", "add", "-b", "t/a", cls.wt)
        for i, text in enumerate(["one", "two"], 1):
            with open(os.path.join(cls.wt, "a.txt"), "w") as f:
                f.write(text + "\n")
            git(cls.wt, "commit", "-am", "round " + text)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_worktrees_lists_main_first(self):
        result = gitread.worktrees(self.main)
        self.assertEqual(result[0], {"branch": "master", "path": self.main})
        self.assertIn({"branch": "t/a", "path": self.wt}, result)

    def test_rounds_are_numbered_oldest_first(self):
        result = gitread.rounds(self.main, "t/a")
        self.assertEqual([r["n"] for r in result], [1, 2])
        self.assertEqual([r["subject"] for r in result], ["round one", "round two"])
        self.assertEqual(len(result[0]["sha"]), 40)

    def test_rounds_of_master_are_empty(self):
        self.assertEqual(gitread.rounds(self.main, "master"), [])

    def test_dirty_sees_an_edit_and_a_new_file(self):
        self.assertFalse(gitread.dirty(self.wt))
        os.makedirs(os.path.join(self.wt, ".review"))
        with open(os.path.join(self.wt, ".review", "x.json"), "w") as f:
            f.write("{}")
        self.assertFalse(gitread.dirty(self.wt))
        path = os.path.join(self.wt, "a.txt")
        with open(path) as f:
            text = f.read()
        with open(path, "w") as f:
            f.write("changed\n")
        self.assertTrue(gitread.dirty(self.wt))
        with open(path, "w") as f:
            f.write(text)
        self.assertFalse(gitread.dirty(self.wt))
        new = os.path.join(self.wt, "new.txt")
        with open(new, "w") as f:
            f.write("x")
        self.assertTrue(gitread.dirty(self.wt))
        os.remove(new)

    def test_head_gives_branch_and_short_commit(self):
        h = gitread.head(self.wt)
        self.assertEqual(h["branch"], "t/a")
        self.assertEqual(h["commit"], gitread.rounds(self.main, "t/a")[-1]["sha"][:7])
        self.assertEqual(gitread.head(self.tmp.name), {"branch": None, "commit": None})

    def test_show_returns_old_text_and_none_for_missing(self):
        self.assertEqual(gitread.show(self.main, "master", "a.txt"), "old\n")
        self.assertEqual(gitread.show(self.main, "t/a", "a.txt"), "two\n")
        self.assertIsNone(gitread.show(self.main, "master", "missing.txt"))

    def test_valid_branch_refuses(self):
        for bad in ["../x", "a b", "a;b", "-x", ""]:
            self.assertFalse(gitread.valid_branch(bad), bad)
        self.assertTrue(gitread.valid_branch("t/a"))

    def test_valid_path_refuses(self):
        for bad in ["../x", "/etc/passwd", ".git/config", "a/../b"]:
            self.assertFalse(gitread.valid_path(bad), bad)
        self.assertTrue(gitread.valid_path("posts/index.html"))

    def test_show_refuses_option_like_rev(self):
        out = os.path.join(self.main, "x")
        self.assertIsNone(gitread.show(self.main, "--output=" + out, "a"))
        self.assertFalse(os.path.exists(out))

    def test_rounds_refuses_option_like_base_or_branch(self):
        out = os.path.join(self.main, "x")
        self.assertEqual(gitread.rounds(self.main, "t/a", base="--output=" + out), [])
        self.assertEqual(gitread.rounds(self.main, "--output=" + out), [])
        self.assertFalse(os.path.exists(out))

    def test_dirty_is_true_when_git_fails(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertTrue(gitread.dirty(d))
        self.assertTrue(gitread.dirty("/nonexistent-folder-xyz"))

    def test_valid_path_refuses_control_characters_and_empty(self):
        for bad in ["a\x00b", "", "a\nb", "a\x7fb", "a\x1fb"]:
            self.assertFalse(gitread.valid_path(bad), repr(bad))

    def test_show_of_bad_path_returns_none(self):
        self.assertIsNone(gitread.show(self.main, "master", "a\x00b"))

    def test_branch_head_is_the_full_sha_or_none(self):
        self.assertEqual(gitread.branch_head(self.main, "t/a"), gitread.rounds(self.main, "t/a")[-1]["sha"])
        self.assertIsNone(gitread.branch_head(self.main, "nope"))
        self.assertIsNone(gitread.branch_head(self.main, "--all"))


if __name__ == "__main__":
    unittest.main()
