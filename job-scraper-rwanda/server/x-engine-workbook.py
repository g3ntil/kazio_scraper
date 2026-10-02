"""Isolated workbook access. Only K/L cells on Conversation Questions are patched."""
import datetime
import hashlib
import io
import json
import os
from pathlib import Path
import posixpath
import re
import shutil
import sys
import tempfile
import xml.etree.ElementTree as ET
import zipfile

NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
FIELDS = ['id', 'question', 'category', 'mechanic', 'audience', 'replyGoal', 'showOff', 'debatePotential', 'platform', 'freshness', 'status', 'usedOn']


class WorkbookError(Exception):
    def __init__(self, message, status=409):
        super().__init__(message)
        self.status = status


def inspect(data, name):
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        book = ET.fromstring(archive.read('xl/workbook.xml'))
        sheet = next((s for s in book.findall('s:sheets/s:sheet', NS) if s.get('name') == 'Conversation Questions'), None)
        if sheet is None:
            raise WorkbookError('The workbook needs a Conversation Questions sheet.')
        relations = ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))
        target = next((r.get('Target') for r in relations if r.get('Id') == sheet.get('{' + REL + '}id')), None)
        if not target:
            raise WorkbookError('The question sheet could not be found.')
        member = target.lstrip('/') if target.startswith('/') else posixpath.normpath(posixpath.join('xl', target))
        xml = archive.read(member)
        strings = []
        if 'xl/sharedStrings.xml' in archive.namelist():
            strings = [''.join(si.itertext()) for si in ET.fromstring(archive.read('xl/sharedStrings.xml'))]
        rows = ET.fromstring(xml).findall('s:sheetData/s:row', NS)

        def values(row):
            result = {}
            for cell in row.findall('s:c', NS):
                col = re.sub(r'\d', '', cell.get('r', ''))
                value = cell.find('s:v', NS)
                text = value.text or '' if value is not None else ''
                if cell.get('t') == 's':
                    text = strings[int(text)]
                elif cell.get('t') == 'inlineStr':
                    text = ''.join(t.text or '' for t in cell.findall('.//s:t', NS))
                result[col] = text
            return result

        header = next((values(row) for row in rows if row.get('r') == '4'), {})
        if any(header.get(col) != expected for col, expected in [('A', 'Q-ID'), ('B', 'Question'), ('K', 'Status'), ('L', 'Used On')]):
            raise WorkbookError('The question sheet layout has changed. Expected Q-ID, Question, Status and Used On columns on row 4.')
        questions, locations, seen = [], {}, set()
        for row in rows:
            if int(row.get('r', '0')) <= 4:
                continue
            cells = values(row)
            if not cells.get('A') or not cells.get('B'):
                continue
            question = {field: cells.get(chr(65 + i), '') for i, field in enumerate(FIELDS)}
            question['status'] = question['status'].strip().upper()
            if question['status'] not in ('UNUSED', 'USED'):
                raise WorkbookError('A question has an unsupported status. Use UNUSED or USED in the workbook.')
            if question['id'] in seen:
                raise WorkbookError('Question IDs must be unique before changes can be saved.')
            seen.add(question['id'])
            locations[question['id']] = row.get('r')
            questions.append(question)
        return {'questions': questions, 'workbookName': name, 'categories': sorted({q['category'] for q in questions if q['category']})}, member, xml, locations


def patch_cell(xml, row_id, col, value):
    # Patch the original XML bytes, preserving every other cell, style and namespace.
    text = xml.decode('utf-8')
    row_pattern = re.compile(r'(<(?P<prefix>\w+:)?row\b[^>]*\br="' + row_id + r'"[^>]*>)(?P<body>.*?)(</(?:\w+:)?row>)', re.S)
    match = row_pattern.search(text)
    if not match:
        raise WorkbookError('The selected question row could not be updated.')
    ref = col + row_id
    cell_pattern = re.compile(r'<(?:\w+:)?c\b[^>]*\br="' + ref + r'"[^>]*(?:/>|>.*?</(?:\w+:)?c>)', re.S)
    body = match.group('body')
    existing = cell_pattern.search(body)
    style = re.search(r'\bs="[^"]*"', existing.group(0).split('>')[0]) if existing else None
    prefix = match.group('prefix') or ''
    style_attr = (' ' + style.group(0)) if style else ''
    replacement = f'<{prefix}c r="{ref}"{style_attr} t="inlineStr"><{prefix}is><{prefix}t>{value}</{prefix}t></{prefix}is></{prefix}c>'
    if existing:
        body = body[:existing.start()] + replacement + body[existing.end():]
    else:
        following = next((m for m in re.finditer(r'<(?:\w+:)?c\b[^>]*\br="([A-Z]+)\d+"', body) if (len(m.group(1)), m.group(1)) > (len(col), col)), None)
        position = following.start() if following else len(body)
        body = body[:position] + replacement + body[position:]
    return (text[:match.start('body')] + body + text[match.end('body'):]).encode('utf-8')


def execute(path, operation, question_id=''):
    path = Path(path).resolve()
    if operation not in ('read', 'used', 'unused'):
        raise WorkbookError('Unsupported workbook action.', 400)
    if operation == 'read':
        return inspect(path.read_bytes(), path.name)[0]
    owner = path.with_name('~$' + path.name)
    if owner.exists():
        raise WorkbookError('Close this workbook in Excel, then retry. Your question has not been changed.', 423)
    lock = path.with_name(path.name + '.x-engine.lock')
    try:
        descriptor = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError:
        raise WorkbookError('The workbook is busy with another save. Retry in a moment.', 423)
    temporary = None
    try:
        os.close(descriptor)
        original = path.read_bytes()
        payload, member, xml, locations = inspect(original, path.name)
        if question_id not in locations:
            raise WorkbookError('That question is no longer in the workbook. Refresh and choose another.', 404)
        question = next(q for q in payload['questions'] if q['id'] == question_id)
        status = operation.upper()
        if question['status'] == status:
            return payload
        updated = patch_cell(xml, locations[question_id], 'K', status)
        updated = patch_cell(updated, locations[question_id], 'L', datetime.date.today().isoformat() if operation == 'used' else '')
        fd, temporary = tempfile.mkstemp(prefix='.x-engine-', suffix='.xlsx', dir=path.parent)
        with os.fdopen(fd, 'w+b') as stream:
            with zipfile.ZipFile(io.BytesIO(original)) as source, zipfile.ZipFile(stream, 'w') as target:
                target.comment = source.comment
                for info in source.infolist():
                    target.writestr(info, updated if info.filename == member else source.read(info.filename))
            stream.flush()
            os.fsync(stream.fileno())
        result = inspect(Path(temporary).read_bytes(), path.name)[0]
        if owner.exists() or hashlib.sha256(path.read_bytes()).digest() != hashlib.sha256(original).digest():
            raise WorkbookError('The workbook changed during saving. Refresh and retry; your question was not changed.')
        backup = path.with_name(path.name + '.x-engine.bak')
        shutil.copyfile(path, backup)
        os.replace(temporary, path)
        temporary = None
        return result
    finally:
        if temporary:
            Path(temporary).unlink(missing_ok=True)
        lock.unlink(missing_ok=True)


if __name__ == '__main__':
    try:
        result = execute(*sys.argv[1:])
    except WorkbookError as error:
        result = {'error': str(error), 'status': error.status}
    except PermissionError:
        result = {'error': 'The workbook cannot be saved or read. Close it in Excel, check folder permissions, and retry.', 'status': 423}
    except FileNotFoundError:
        result = {'error': 'The question workbook could not be found. Check X_ENGINE_WORKBOOK_PATH and retry.', 'status': 503}
    except Exception:
        result = {'error': 'The question workbook could not be read or saved. Check that it is a valid Excel workbook and retry.', 'status': 503}
    print(json.dumps(result, ensure_ascii=True))
