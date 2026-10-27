import concurrent.futures
from functools import partial
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).absolute().parents[1]))
from dashboard import Board, Handler


class DashboardTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='manu-board-test-')
        self.root = Path(self.temp.name)
        self.board = Board(self.root)

    def tearDown(self):
        self.temp.cleanup()

    def task(self, task_id='task-one'):
        return self.board.task(task_id, 'Dashboard local', 'Xem tien do that', criteria=['Co bang file'])

    def test_empty_snapshot_is_read_only_and_does_not_claim_agents(self):
        data = self.board.snapshot()
        self.assertIsNone(data['task'])
        self.assertEqual(data['roles'], {})
        self.assertFalse(self.board.home.exists())

    def test_new_task_resets_old_reports_and_rejects_late_writer(self):
        self.task()
        self.board.update('task-one', 'lead', 'working', 'Inspect source')
        self.task('task-two')
        with self.assertRaisesRegex(ValueError, 'Task ID'):
            self.board.update('task-one', 'review', 'done', 'Stale result')
        self.assertEqual(self.board.read()['roles'], {})

    def test_concurrent_reports_are_not_lost(self):
        self.task()
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            futures = [pool.submit(self.board.update, 'task-one', role, 'working', f'Working {role}')
                       for role in ['lead', 'implement', 'review']]
            for future in futures:
                future.result()
        self.assertEqual(set(self.board.read()['roles']), {'lead', 'implement', 'review'})
        self.assertEqual(len(self.board.read()['events']), 4)

    def test_same_task_preserves_reports_and_criteria(self):
        self.task()
        self.board.update('task-one', 'implement', 'working', 'Build UI', files=['sample.py'],
                          checks=['NOT_RUN|Browser not run'])
        self.board.task('task-one', 'Updated title', 'Same task', status='review')
        self.board.update('task-one', 'implement', 'done', 'UI done')
        result = self.board.read()
        self.assertEqual(result['task']['criteria'], ['Co bang file'])
        self.assertEqual(result['roles']['implement']['files'], ['sample.py'])
        self.assertEqual(result['roles']['implement']['checks'][0]['status'], 'NOT_RUN')

    def test_ownership_conflict_does_not_overwrite_board(self):
        self.task()
        self.board.update('task-one', 'implement', 'working', 'Edit shared', files=['shared.py'])
        before = self.board.path.read_bytes()
        with self.assertRaisesRegex(ValueError, 'File đang'):
            self.board.update('task-one', 'lead', 'working', 'Also edit', files=['shared.py'])
        self.assertEqual(self.board.path.read_bytes(), before)
        self.board.update('task-one', 'review', 'review', 'Read shared', files=['shared.py'])

    def test_invalid_evidence_and_paths_do_not_mutate_state(self):
        self.task()
        before = self.board.path.read_bytes()
        for values in [{'files': ['../outside.py']}, {'files': ['C:/private.py']},
                       {'files': ['app/.env.local']}, {'artifacts': ['javascript:alert(1)']},
                       {'checks': ['PASS']}, {'checks': ['UNKNOWN|test']}]:
            with self.subTest(values=values), self.assertRaises(ValueError):
                self.board.update('task-one', 'lead', 'working', 'Invalid input', **values)
        self.assertEqual(self.board.path.read_bytes(), before)

    def test_source_only_allows_declared_files_and_tracks_live_note(self):
        self.task()
        (self.root / 'sample.py').write_text('user work', encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'Chỉ xem'):
            self.board.source('sample.py')
        self.board.update('task-one', 'implement', 'working', 'Inspect', files=['sample.py'])
        self.assertEqual(self.board.source('sample.py')['content'], 'user work')
        self.board.flow.note('Live note', 'Continue review')
        self.assertIn('Live note', self.board.snapshot()['note'])
        self.assertEqual((self.root / 'sample.py').read_text(), 'user work')

    def test_http_read_only_assets_api_and_rejected_routes(self):
        self.task()
        server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, board=self.board))
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        url = f'http://127.0.0.1:{server.server_port}'
        try:
            with urlopen(url + '/api/state') as response:
                self.assertEqual(json.load(response)['service'], 'manu-codex-dashboard')
                self.assertEqual(response.headers['Cache-Control'], 'no-store')
            for path in ['/', '/app.js', '/style.css']:
                with urlopen(url + path) as response:
                    self.assertEqual(response.status, 200)
            for request, code in [(Request(url + '/', headers={'Host': 'untrusted.example'}), 403),
                                  (Request(url + '/api/file?path=../outside.py'), 400),
                                  (Request(url + '/dashboard-state.json'), 404),
                                  (Request(url + '/api/state', data=b'{}', method='POST'), 501)]:
                with self.subTest(url=request.full_url), self.assertRaises(HTTPError) as error:
                    urlopen(request)
                self.assertEqual(error.exception.code, code)
        finally:
            server.shutdown()
            server.server_close()
            worker.join()


if __name__ == '__main__':
    unittest.main()
