"""Local, read-only dashboard and explicit per-role progress reporting. No Git or agent spawning."""
import argparse
from datetime import datetime, timedelta, timezone
from functools import partial
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import sys
import tempfile
import time
from urllib.parse import parse_qs, urlparse

from workflow import Workflow, linked

ROLES = {'lead': 'Trưởng nhóm', 'implement': 'Triển khai', 'review': 'Review / kiểm thử'}
STATUSES = {'planned', 'working', 'review', 'blocked', 'done', 'idle'}
PHASES = {'analysis', 'implementation', 'verification', 'handoff'}
ASSETS = Path(__file__).absolute().parent / 'dashboard'


def now():
    return datetime.now(timezone(timedelta(hours=7))).isoformat(timespec='seconds')


def entry(value, limit=1200):
    if not isinstance(value, str) or not value.strip() or len(value) > limit or '\n' in value or '\r' in value:
        raise ValueError('Mỗi mục phải là một dòng không rỗng, tối đa %s ký tự' % limit)
    return value.strip()


class Board:
    def __init__(self, root):
        self.flow = Workflow(root)
        self.root = self.flow.root.resolve()
        self.home = self.flow.home
        self.path = self.home / 'dashboard-state.json'

    def read(self):
        if linked(self.path):
            raise ValueError('Dashboard state không được là link')
        if not self.path.exists():
            return {'version': 1, 'task': None, 'roles': {}, 'events': [], 'updated_at': None}
        data = json.loads(self.path.read_text(encoding='utf-8'))
        if data.get('version') != 1 or not isinstance(data.get('roles'), dict):
            raise ValueError('Định dạng dashboard state không hợp lệ')
        return data

    def mutate(self, change):
        self.home.mkdir(parents=True, exist_ok=True)
        lock = self.home / '.dashboard.lock'
        if linked(lock) or linked(self.path):
            raise ValueError('Dashboard state/lock không được là link')
        # All roles share a short atomic transaction, so concurrent CLI updates cannot erase one another.
        deadline = time.monotonic() + 5
        while True:
            try:
                stream = lock.open('x', encoding='utf-8')
                break
            except FileExistsError:
                if time.monotonic() >= deadline:
                    raise ValueError('Dashboard đang bị khóa; kiểm tra tiến trình ghi trước khi xử lý .dashboard.lock')
                time.sleep(.05)
        temporary = None
        try:
            with stream:
                stream.write(str(os.getpid()))
            data = self.read()
            change(data)
            data['updated_at'] = now()
            with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=self.home,
                                             prefix='.dashboard-', suffix='.tmp', delete=False) as output:
                temporary = Path(output.name)
                json.dump(data, output, ensure_ascii=False, indent=2)
                output.write('\n')
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary, self.path)
            return data
        finally:
            if temporary and temporary.exists():
                temporary.unlink()
            lock.unlink()

    def task(self, task_id, title, goal, status='working', criteria=None):
        task_id, title, goal = (entry(value) for value in (task_id, title, goal))
        if status not in STATUSES:
            raise ValueError('Trạng thái không hợp lệ')
        if criteria is not None:
            criteria = [entry(value) for value in criteria]
        def change(data):
            previous = data.get('task') or {}
            if previous.get('id') != task_id:
                data['roles'], data['events'] = {}, []
                previous = {}
            data['task'] = dict(id=task_id, title=title, goal=goal, status=status,
                                criteria=criteria if criteria is not None else previous.get('criteria', []))
            self.event(data, 'lead', f'Nhiệm vụ: {title} ({status})')
        return self.mutate(change)

    def file_path(self, value):
        value = entry(value, 500).replace('\\', '/')
        relative = Path(value)
        if relative.is_absolute() or '..' in relative.parts or ':' in value:
            raise ValueError('File phải là đường dẫn tương đối trong workspace')
        path = self.root / relative
        if not path.resolve().is_relative_to(self.root):
            raise ValueError('File nằm ngoài workspace')
        for part in relative.parts:
            lower = part.lower()
            if lower.startswith('.env') or lower in {'.git', '.codex', 'node_modules', 'secrets', 'credentials'}:
                raise ValueError('Không đưa cấu hình riêng tư hoặc thư mục hệ thống vào bảng file')
        return relative.as_posix()

    @staticmethod
    def event(data, role, message):
        data['events'] = [dict(at=now(), role=role, message=message), *data.get('events', [])][:30]

    def update(self, task_id, role, status, action, phase='implementation', next_step=None,
               files=None, checks=None, artifacts=None, model=None, blocker=None):
        task_id, action = entry(task_id), entry(action)
        if role not in ROLES or status not in STATUSES or phase not in PHASES:
            raise ValueError('Vai trò, trạng thái hoặc giai đoạn không hợp lệ')
        fields = {'status': status, 'action': action, 'phase': phase, 'updated_at': now()}
        for name, value in [('next', next_step), ('model', model), ('blocker', blocker)]:
            if value is not None:
                fields[name] = entry(value)
        if files is not None:
            fields['files'] = list(dict.fromkeys(self.file_path(value) for value in files))
        if checks is not None:
            fields['checks'] = []
            for value in checks:
                status_check, separator, label = entry(value).partition('|')
                if not separator or status_check not in {'PASS', 'FAIL', 'NOT_RUN'} or not label.strip():
                    raise ValueError('Kiểm tra dùng PASS|nội dung, FAIL|nội dung hoặc NOT_RUN|nội dung')
                fields['checks'].append({'status': status_check, 'label': label.strip()})
        if artifacts is not None:
            fields['artifacts'] = []
            for value in artifacts:
                value = entry(value)
                parsed = urlparse(value)
                if parsed.scheme not in {'http', 'https'} or not parsed.hostname or parsed.username or parsed.password:
                    raise ValueError('Liên kết demo phải là HTTP/HTTPS, không chứa thông tin đăng nhập')
                fields['artifacts'].append(value)
        def change(data):
            if (data.get('task') or {}).get('id') != task_id:
                raise ValueError('Task ID đã thay đổi hoặc chưa khởi tạo; đọc status trước khi cập nhật')
            for owner, report in data['roles'].items():
                if owner != role and report.get('status') in {'working', 'review'} and status == 'working' and role != 'review':
                    overlap = set(fields.get('files', data['roles'].get(role, {}).get('files', []))) & set(report.get('files', []))
                    if overlap and owner != 'review':
                        raise ValueError('File đang có người phụ trách: ' + ', '.join(sorted(overlap)))
            report = data['roles'].setdefault(role, {})
            report.update(fields)
            if status != 'blocked' and blocker is None:
                report.pop('blocker', None)
            self.event(data, role, action)
        return self.mutate(change)

    def snapshot(self):
        data = self.read()
        data['note'] = self.flow.resume()
        data['note_updated_at'] = (datetime.fromtimestamp(self.flow.current.stat().st_mtime,
                                    timezone(timedelta(hours=7))).isoformat(timespec='seconds')
                                   if self.flow.current.exists() else None)
        data['workspace'] = self.root.name
        data['workspace_path'] = str(self.root)
        data['service'] = 'manu-codex-dashboard'
        data['served_at'] = now()
        return data

    def source(self, value):
        value = self.file_path(value)
        declared = {'AGENTS.md', 'codex-workflow/CURRENT.md', 'codex-workflow/README.md', 'codex-workflow/PROMPTS.md'}
        for role in self.read()['roles'].values():
            declared.update(role.get('files', []))
        if value not in declared:
            raise ValueError('Chỉ xem file hướng dẫn hoặc file đã khai báo trên dashboard')
        path = self.root / value
        if not path.is_file() or path.stat().st_size > 1_000_000:
            raise ValueError('File chưa tồn tại hoặc lớn hơn 1 MB')
        return {'path': value, 'content': path.read_text(encoding='utf-8-sig')}


class Handler(BaseHTTPRequestHandler):
    def __init__(self, *args, board, **kwargs):
        self.board = board
        super().__init__(*args, **kwargs)

    def log_message(self, *_args):
        pass

    def do_GET(self):
        # Keep the service loopback-only even when accessed through an unexpected browser hostname.
        host = self.headers.get('Host', '').split(':')[0]
        if host not in {'127.0.0.1', 'localhost'}:
            self.send_error(403)
            return
        route = urlparse(self.path)
        try:
            if route.path == '/api/state':
                content, mime = json.dumps(self.board.snapshot(), ensure_ascii=False).encode(), 'application/json'
            elif route.path == '/api/file':
                value = parse_qs(route.query).get('path', [''])[0]
                content, mime = json.dumps(self.board.source(value), ensure_ascii=False).encode(), 'application/json'
            elif route.path in {'/', '/index.html', '/app.js', '/style.css'}:
                name = {'/': 'index.html'}.get(route.path, route.path[1:])
                content = (ASSETS / name).read_bytes()
                mime = {'index.html': 'text/html', 'app.js': 'text/javascript', 'style.css': 'text/css'}[name]
            else:
                self.send_error(404)
                return
        except (ValueError, OSError, UnicodeError) as error:
            content, mime = json.dumps({'error': str(error)}, ensure_ascii=False).encode(), 'application/json'
            self.respond(content, mime, 400)
            return
        self.respond(content, mime)

    def respond(self, content, mime, code=200):
        self.send_response(code)
        self.send_header('Content-Type', mime + '; charset=utf-8')
        self.send_header('Content-Length', str(len(content)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Security-Policy', "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'")
        self.end_headers()
        self.wfile.write(content)


def main():
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, 'reconfigure'):
            stream.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).absolute().parent.parent)
    commands = parser.add_subparsers(dest='command', required=True)
    server = commands.add_parser('serve', help='Serve local read-only dashboard')
    server.add_argument('--port', type=int, default=19329)
    commands.add_parser('status', help='Read current task and role reports')
    task = commands.add_parser('task', help='Set task; a new ID clears old role reports')
    task.add_argument('--id', required=True)
    task.add_argument('--title', required=True)
    task.add_argument('--goal', required=True)
    task.add_argument('--status', choices=sorted(STATUSES), default='working')
    task.add_argument('--criterion', action='append', default=None)
    update = commands.add_parser('update', help='Report only the work this role actually performed')
    update.add_argument('--task-id', required=True)
    update.add_argument('--role', choices=ROLES, required=True)
    update.add_argument('--status', choices=sorted(STATUSES), required=True)
    update.add_argument('--action', required=True)
    update.add_argument('--phase', choices=sorted(PHASES), default='implementation')
    update.add_argument('--next', dest='next_step')
    update.add_argument('--model')
    update.add_argument('--blocker')
    for flag in ['file', 'check', 'artifact']:
        update.add_argument('--' + flag, dest=flag + 's', action='append', default=None)
    args = parser.parse_args()
    try:
        board = Board(args.root)
        if args.command == 'serve':
            server = ThreadingHTTPServer(('127.0.0.1', args.port), partial(Handler, board=board))
            print(f'http://127.0.0.1:{server.server_port} — dashboard local, Ctrl+C để dừng', flush=True)
            try:
                server.serve_forever()
            except KeyboardInterrupt:
                pass
            finally:
                server.server_close()
            return 0
        if args.command == 'status':
            result = board.snapshot()
        elif args.command == 'task':
            result = board.task(args.id, args.title, args.goal, args.status, args.criterion)
        else:
            values = vars(args).copy()
            for key in ['root', 'command']:
                values.pop(key)
            result = board.update(**values)
        if args.command == 'status':
            print(json.dumps(result, ensure_ascii=False, indent=2))
        else:
            print(json.dumps({'task_id': result['task']['id'], 'status': result['task']['status'],
                              'role': getattr(args, 'role', None), 'updated_at': result['updated_at']}, ensure_ascii=False))
        return 0
    except (OSError, ValueError) as error:
        print(f'Không thực hiện được: {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
