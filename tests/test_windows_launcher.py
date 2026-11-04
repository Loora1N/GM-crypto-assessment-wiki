"""Run the release launcher under Windows PowerShell 5.1 and cmd.exe."""

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parent.parent
POWERSHELL = Path(os.environ.get("SystemRoot", "C:/Windows")) / "System32/WindowsPowerShell/v1.0/powershell.exe"


@unittest.skipUnless(sys.platform == "win32", "Windows launcher integration tests")
class WindowsLauncherTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory(prefix="wiki-launcher-")
        cls.root = Path(cls.temporary.name)
        # A native executable keeps the tests independent of pip/network/browser
        # while exercising real cmd/PowerShell quoting, discovery and exit codes.
        source = r'''
using System;
using System.Diagnostics;
using System.IO;
public class PythonFixture {
    public static int Main(string[] args) {
        string exe = Process.GetCurrentProcess().MainModule.FileName;
        if (args.Length > 0 && args[0] == "-c") {
            string version = File.Exists(exe + ".version") ? File.ReadAllText(exe + ".version") : "[3,12,3]";
            Console.WriteLine("{\"path\":\"" + exe.Replace("\\", "\\\\") + "\",\"version\":" + version + "}");
            return 0;
        }
        if (args.Length < 2 || args[0] != "-m") return 2;
        string module = args[1];
        File.AppendAllText(Environment.GetEnvironmentVariable("WIKI_TEST_LOG"), module + "\n");
        Console.WriteLine("Ran " + module);
        if (Environment.GetEnvironmentVariable("WIKI_TEST_FAIL") == module) return 7;
        if (module == "venv") {
            string scripts = Path.Combine(args[2], "Scripts");
            Directory.CreateDirectory(scripts);
            File.Copy(exe, Path.Combine(scripts, "python.exe"));
            if (File.Exists(exe + ".version")) File.Copy(exe + ".version", Path.Combine(scripts, "python.exe.version"));
        }
        return 0;
    }
}
'''
        compile_script = cls.root / "compile.ps1"
        cls.fixture = cls.root / "python.exe"
        compile_script.write_text("Add-Type -TypeDefinition @'\n" + source + "\n'@ -OutputAssembly '" + str(cls.fixture) + "' -OutputType ConsoleApplication\n", encoding="utf-8-sig")
        subprocess.run([str(POWERSHELL), "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(compile_script)], check=True, capture_output=True)

    @classmethod
    def tearDownClass(cls):
        cls.temporary.cleanup()

    def setUp(self):
        self.workspace = Path(tempfile.mkdtemp(dir=self.root)) / "中文 project & (copy)!"
        self.workspace.mkdir()
        for name in ("run-windows.bat", "run-windows.ps1"):
            shutil.copyfile(ROOT / name, self.workspace / name)
        for name in ("mkdocs.yml", "requirements.txt"):
            (self.workspace / name).touch()
        self.log = self.workspace / "calls.log"
        self.env = {**os.environ, "WIKI_PYTHON": str(self.fixture), "WIKI_TEST_LOG": str(self.log), "WIKI_TEST_FAIL": ""}

    def run_powershell(self, body, env=None):
        harness = self.workspace / "test.ps1"
        harness.write_text("$ErrorActionPreference = 'Stop'\n[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)\n. (Join-Path $PSScriptRoot 'run-windows.ps1')\n" + body, encoding="utf-8-sig")
        return subprocess.run([str(POWERSHELL), "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(harness)], cwd=self.root, env=env or self.env, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=30)

    def run_batch(self):
        # cmd /c needs the outer quoting when both the executable's path and
        # its directory contain shell metacharacters. stdin releases pause.
        command = '"' + str(self.workspace / "run-windows.bat") + '"'
        return subprocess.run(os.environ["COMSPEC"] + ' /d /c "' + command + '"', cwd=self.root, env=self.env, input="\n", capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=30)

    def test_real_python_without_path_or_launcher(self):
        env = {**self.env, "PATH": "", "WIKI_PYTHON": sys.executable}
        result = self.run_powershell("Find-WikiPython | ConvertTo-Json -Compress", env)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(Path(json.loads(result.stdout)["path"]), Path(sys.executable))

    def test_registry_and_common_install_discovery_without_path(self):
        for registered in (True, False):
            with self.subTest(registered=registered):
                local = self.workspace / ("registered" if registered else "local")
                installed = local / "Programs/Python/Python312/python.exe"
                installed.parent.mkdir(parents=True)
                shutil.copyfile(self.fixture, installed)
                env = {**self.env, "PATH": "", "WIKI_PYTHON": "", "LOCALAPPDATA": str(local), "USERPROFILE": str(local), "ProgramFiles": str(local), "ProgramFiles(x86)": str(local), "ProgramData": str(local), "SystemDrive": str(local), "WIKI_TEST_REGISTERED": str(installed)}
                registry = "$env:WIKI_TEST_REGISTERED" if registered else ""
                # Model a PEP 514 registration without changing the real registry.
                body = "function Get-WikiRegisteredPython { " + registry + " }\nFind-WikiPython | ConvertTo-Json -Compress"
                result = self.run_powershell(body, env)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(Path(json.loads(result.stdout)["path"]), installed)

    def test_first_launch_and_reuse_with_lf_and_crlf(self):
        for newline in ("\n", "\r\n"):
            with self.subTest(newline=repr(newline)):
                batch = self.workspace / "run-windows.bat"
                batch.write_bytes((ROOT / batch.name).read_text("ascii").replace("\n", newline).encode("ascii"))
                result = self.run_batch()
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertIn("服务已停止", result.stdout)
                self.assertNotIn("is not recognized", result.stdout + result.stderr)
        self.assertEqual(self.log.read_text().splitlines(), ["venv", "pip", "mkdocs", "pip", "mkdocs"])

    def test_failures_stop_before_later_stages(self):
        for module in ("venv", "pip", "mkdocs"):
            with self.subTest(module=module):
                self.env["WIKI_TEST_FAIL"] = module
                if self.log.exists():
                    self.log.unlink()
                result = self.run_batch()
                self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
                self.assertIn("[错误]", result.stdout)
                calls = self.log.read_text().splitlines()
                self.assertEqual(calls[-1], module)
                if module != "mkdocs":
                    self.assertNotIn("mkdocs", calls)

    def test_supported_versions_create_and_reuse_environment(self):
        for version in ([3, 9, 0], [3, 10, 0], [3, 11, 0], [3, 12, 0], [3, 13, 0], [3, 14, 0]):
            with self.subTest(version=version):
                # Each version gets a fresh project and keeps its version when
                # the fixture creates .venv, exercising both version gates.
                self.setUp()
                candidate = self.workspace / "python.exe"
                shutil.copyfile(self.fixture, candidate)
                Path(str(candidate) + ".version").write_text(json.dumps(version))
                self.env["WIKI_PYTHON"] = str(candidate)
                for _ in range(2):
                    result = self.run_batch()
                    self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                    self.assertIn(".".join(map(str, version)), result.stdout)
                self.assertEqual(self.log.read_text().splitlines(), ["venv", "pip", "mkdocs", "pip", "mkdocs"])

    def test_missing_and_old_python_report_actionable_errors(self):
        old = self.workspace / "old-python.exe"
        shutil.copyfile(self.fixture, old)
        Path(str(old) + ".version").write_text("[3,8,20]")
        for candidate in (None, old):
            with self.subTest(candidate=candidate):
                self.env["WIKI_TEST_OLD"] = str(candidate or "")
                result = self.run_powershell("function Get-WikiPythonCandidates { if ($env:WIKI_TEST_OLD) { [pscustomobject]@{ Path=$env:WIKI_TEST_OLD; Arguments=@() } } }\nexit (Start-WikiPreview)")
                self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
                self.assertIn("WIKI_PYTHON", result.stdout)
                if candidate:
                    self.assertIn("3.8.20", result.stdout)
                self.assertFalse(self.log.exists())

    def test_copied_broken_environment_is_preserved(self):
        venv = self.workspace / ".venv"
        venv.mkdir()
        marker = venv / "keep.txt"
        marker.write_text("user environment")
        result = self.run_batch()
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn(".venv-backup", result.stdout)
        self.assertEqual(marker.read_text(), "user environment")
        self.assertFalse(self.log.exists())


if __name__ == "__main__":
    unittest.main()
