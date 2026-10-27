"""Small workspace discovery and resumable current-note helper; no task approval gates."""
import argparse
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import sys
import time

SKIP_DIRS = {'.git', '.svn', '.hg', 'node_modules', '.next', 'bin', 'obj', '.vs',
             'dist', 'coverage', '__pycache__', '.venv', 'venv', '.idea', '.turbo'}
MARKERS = {'package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'pom.xml',
           'build.gradle', 'build.gradle.kts', 'CMakeLists.txt', 'composer.json', 'Gemfile', 'AGENTS.md'}


def linked(path):
    return path.is_symlink() or (hasattr(path, 'is_junction') and path.is_junction())


class Workflow:
    def __init__(self, root):
        self.root = Path(root).absolute()
        self.home = self.root / 'codex-workflow'
        if not self.root.is_dir() or linked(self.root) or linked(self.home):
            raise ValueError('Workspace and workflow folder must be real directories')
        self.current = self.home / 'CURRENT.md'

    def projects(self):
        projects = []
        for path in sorted(self.root.iterdir()):
            if not path.is_dir() or linked(path) or path.name.startswith('.') or path.name == 'codex-workflow':
                continue
            markers = sorted(p.name for p in path.iterdir() if p.is_file()
                             and (p.name in MARKERS or p.suffix.lower() in {'.sln', '.slnx', '.csproj'}))
            if not markers:
                continue
            guides = []
            for parent, dirs, files in os.walk(path, followlinks=False):
                dirs[:] = [d for d in dirs if d.lower() not in SKIP_DIRS and not linked(Path(parent) / d)]
                if 'AGENTS.md' in files and not linked(Path(parent) / 'AGENTS.md'):
                    guides.append((Path(parent) / 'AGENTS.md').relative_to(self.root).as_posix())
            projects.append({'project': path.name, 'markers': markers, 'guides': guides})
        return projects

    def resume(self):
        if linked(self.current):
            raise ValueError('CURRENT.md must not be a link')
        if not self.current.exists():
            return 'Chưa có note. Đọc AGENTS.md và yêu cầu hiện tại trước khi bắt đầu.\n'
        return self.current.read_text(encoding='utf-8-sig')

    def note(self, task, next_step, *, status='in_progress', files=(), done=(), checks=(), blockers=()):
        if status not in {'in_progress', 'blocked', 'done'}:
            raise ValueError('Invalid status')
        groups = [files, done, checks, blockers]
        values = [task, next_step, *[item for group in groups for item in group]]
        if any(not isinstance(v, str) or not v.strip() or len(v) > 600 or '\n' in v or '\r' in v for v in values):
            raise ValueError('Each note entry must be one nonempty line, at most 600 characters')
        if any(len(group) > 12 for group in groups):
            raise ValueError('Keep at most 12 entries per section')
        lines = ['# Tiếp tục công việc', '', f'- Trạng thái: {status}',
                 f'- Cập nhật: {datetime.now(timezone(timedelta(hours=7))).isoformat(timespec="seconds")}', f'- Mục tiêu: {task}']
        for label, items in [('File', files), ('Đã làm / quyết định', done), ('Kiểm tra', checks), ('Còn vướng', blockers)]:
            lines.extend(f'- {label}: {item}' for item in items)
        lines.append(f'- Bước tiếp theo: {next_step}')
        content = '\n'.join(lines) + '\n'
        if len(content) > 12000:
            raise ValueError('Note too long; summarize before saving')
        self.home.mkdir(parents=True, exist_ok=True)
        lock, temporary = self.home / '.checkpoint.lock', self.home / 'CURRENT.md.tmp'
        if any(linked(p) for p in [self.current, lock, temporary]):
            raise ValueError('Linked note/output is forbidden')
        # Exclusive lock prevents simultaneous writes; no history or task reports are generated.
        with lock.open('x', encoding='utf-8') as stream:
            stream.write(str(os.getpid()))
        try:
            with temporary.open('x', encoding='utf-8', newline='\n') as stream:
                stream.write(content)
                stream.flush()
                os.fsync(stream.fileno())
            for attempt in range(5):
                try:
                    os.replace(temporary, self.current)
                    break
                except PermissionError:
                    if attempt == 4:
                        raise
                    time.sleep(0.05 * (attempt + 1))
        finally:
            lock.unlink()
        return content


def main():
    # Windows redirected output may default to a code page without Vietnamese.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, 'reconfigure'):
            stream.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).absolute().parent.parent)
    commands = parser.add_subparsers(dest='command', required=True)
    commands.add_parser('projects', help='Discover source projects without modifying them')
    commands.add_parser('resume', help='Read the current continuation note')
    note = commands.add_parser('note', help='Replace the current note with a short checkpoint')
    note.add_argument('--task', required=True)
    note.add_argument('--next', dest='next_step', required=True)
    note.add_argument('--status', choices=['in_progress', 'blocked', 'done'], default='in_progress')
    for name in ['files', 'done', 'check', 'blocker']:
        note.add_argument('--' + name, action='append', default=[])
    args = parser.parse_args()
    try:
        flow = Workflow(args.root)
        if args.command == 'projects':
            print(json.dumps(flow.projects(), ensure_ascii=False, indent=2))
        elif args.command == 'resume':
            print(flow.resume(), end='')
        else:
            print(flow.note(args.task, args.next_step, status=args.status, files=args.files,
                            done=args.done, checks=args.check, blockers=args.blocker), end='')
        return 0
    except (ValueError, OSError) as error:
        print(f'Không thực hiện được: {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
