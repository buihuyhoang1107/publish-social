import sys
import os
import subprocess
from pathlib import Path
import tempfile
import unittest

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).absolute().parents[1]))
from workflow import Workflow


class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='manu-note-test-')
        self.root = Path(self.temp.name)
        self.flow = Workflow(self.root)

    def tearDown(self):
        self.temp.cleanup()

    def test_discovery_and_resume_are_read_only(self):
        for project, marker in [('web', 'package.json'), ('api', 'Api.sln'), ('lib', 'AGENTS.md')]:
            directory = self.root / project
            directory.mkdir()
            (directory / marker).write_text('fixture', encoding='utf-8')
        self.assertEqual([p['project'] for p in self.flow.projects()], ['api', 'lib', 'web'])
        self.assertIn('Chưa có note', self.flow.resume())
        self.assertFalse(self.flow.home.exists())

    def test_checkpoint_replaces_history_and_preserves_source(self):
        source = self.root / 'sample.cs'
        source.write_text('user work', encoding='utf-8')
        self.flow.note('First task', 'Continue A', done=['First action'])
        result = self.flow.note('Second task', 'Continue B', done=['Second action'], checks=['unit: passed'])
        self.assertEqual(self.flow.resume(), result)
        self.assertNotIn('First task', result)
        self.assertIn('Second action', result)
        self.assertEqual(source.read_text(encoding='utf-8'), 'user work')
        self.assertEqual([p.name for p in self.flow.home.iterdir()], ['CURRENT.md'])

    def test_invalid_or_long_note_preserves_previous(self):
        before = self.flow.note('Task', 'Next step')
        for task, next_step in [('', 'next'), ('task', ''), ('task\nInjected', 'next'), ('a' * 601, 'next')]:
            with self.subTest(task=task[:20]), self.assertRaises(ValueError):
                self.flow.note(task, next_step)
        self.assertEqual(self.flow.resume(), before)

    def test_lock_does_not_overwrite_another_writer(self):
        before = self.flow.note('Task', 'Next step')
        lock = self.flow.home / '.checkpoint.lock'
        lock.write_text('other writer', encoding='utf-8')
        with self.assertRaises(FileExistsError): self.flow.note('New task', 'New step')
        self.assertEqual(lock.read_text(encoding='utf-8'), 'other writer')
        self.assertEqual(self.flow.resume(), before)

    def test_stale_temporary_keeps_existing_note(self):
        before = self.flow.note('Task', 'Next step')
        (self.flow.home / 'CURRENT.md.tmp').write_text('interrupted', encoding='utf-8')
        with self.assertRaises(FileExistsError): self.flow.note('New task', 'New step')
        self.assertEqual(self.flow.resume(), before)
        self.assertFalse((self.flow.home / '.checkpoint.lock').exists())

    def test_done_and_blocked_states(self):
        self.assertIn('Trạng thái: blocked', self.flow.note('Task', 'Ask for contract', status='blocked', blockers=['Missing DTO']))
        self.assertIn('Trạng thái: done', self.flow.note('Task', 'Wait for next request', status='done'))

    def test_cli_vietnamese_under_ascii_console(self):
        script = Path(__file__).absolute().parents[1] / 'workflow.py'
        result = subprocess.run(
            [sys.executable, '-B', str(script), '--root', str(self.root), 'note',
             '--task', 'Sửa nguồn', '--next', 'Kiểm tra tiếp'],
            capture_output=True, encoding='utf-8', env=dict(os.environ, PYTHONIOENCODING='ascii'))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('Kiểm tra tiếp', result.stdout)
        self.assertIn('Sửa nguồn', self.flow.resume())


if __name__ == '__main__':
    unittest.main()
