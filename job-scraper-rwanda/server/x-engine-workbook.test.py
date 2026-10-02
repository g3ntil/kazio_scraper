"""Run with Python unittest. Every write uses an isolated temporary workbook."""
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

spec = importlib.util.spec_from_file_location('workbook', Path(__file__).with_name('x-engine-workbook.py'))
workbook = importlib.util.module_from_spec(spec)
spec.loader.exec_module(workbook)


def fixture():
    cells = lambda row, values: ''.join(f'<c r="{col}{row}" s="2" t="inlineStr"><is><t>{value}</t></is></c>' for col, value in values.items())
    xml = '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
    xml += '<row r="4">' + cells(4, {'A': 'Q-ID', 'B': 'Question', 'K': 'Status', 'L': 'Used On'}) + '</row>'
    xml += '<row r="5">' + cells(5, {'A': 'Q-001', 'B': 'What did you build?', 'C': 'Building', 'K': 'UNUSED', 'M': 'Preserve me'}) + '</row>'
    xml += '<row r="6">' + cells(6, {'A': 'Q-002', 'B': 'What changed?', 'C': 'Learning', 'K': 'USED', 'L': '2026-01-02'}) + '</row></sheetData><extLst/></worksheet>'
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
        archive.comment = b'preserve archive comment'
        archive.writestr('xl/workbook.xml', '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Conversation Questions" sheetId="1" r:id="rId1"/></sheets></workbook>')
        archive.writestr('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>')
        archive.writestr('xl/worksheets/sheet1.xml', xml)
        archive.writestr('xl/worksheets/sheet2.xml', b'other sheet unchanged')
        archive.writestr('xl/styles.xml', b'styles unchanged')
    return output.getvalue()


class WorkbookTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / 'questions.xlsx'
        self.original = fixture()
        self.path.write_bytes(self.original)

    def test_read(self):
        result = workbook.execute(self.path, 'read')
        self.assertEqual(result['categories'], ['Building', 'Learning'])
        self.assertEqual(result['questions'][0]['status'], 'UNUSED')

    def test_used_undo_preserves_members_and_xml(self):
        result = workbook.execute(self.path, 'used', 'Q-001')
        self.assertEqual(result['questions'][0]['status'], 'USED')
        self.assertRegex(result['questions'][0]['usedOn'], r'^\d{4}-\d{2}-\d{2}$')
        self.assertEqual(self.path.with_name(self.path.name + '.x-engine.bak').read_bytes(), self.original)
        with zipfile.ZipFile(io.BytesIO(self.original)) as before, zipfile.ZipFile(self.path) as after:
            self.assertEqual(before.namelist(), after.namelist())
            self.assertEqual(before.comment, after.comment)
            for member in before.namelist():
                if member != 'xl/worksheets/sheet1.xml':
                    self.assertEqual(before.read(member), after.read(member))
            expected = workbook.patch_cell(before.read('xl/worksheets/sheet1.xml'), '5', 'K', 'USED')
            expected = workbook.patch_cell(expected, '5', 'L', result['questions'][0]['usedOn'])
            self.assertEqual(expected, after.read('xl/worksheets/sheet1.xml'))
            self.assertIn(b'<c r="M5" s="2"', expected)
        result = workbook.execute(self.path, 'unused', 'Q-001')
        self.assertEqual(result['questions'][0]['status'], 'UNUSED')
        self.assertEqual(result['questions'][0]['usedOn'], '')
        self.assertEqual(result['questions'][1]['usedOn'], '2026-01-02')

    def test_invalid_id_and_action_do_not_write(self):
        for operation, id_value in [('used', 'missing'), ('delete', 'Q-001')]:
            with self.assertRaises(workbook.WorkbookError):
                workbook.execute(self.path, operation, id_value)
        self.assertEqual(self.path.read_bytes(), self.original)

    def test_invalid_status(self):
        with zipfile.ZipFile(io.BytesIO(self.original)) as source, zipfile.ZipFile(self.path, 'w') as target:
            for member in source.namelist():
                target.writestr(member, source.read(member).replace(b'UNUSED', b'UNKNOWN'))
        with self.assertRaises(workbook.WorkbookError):
            workbook.execute(self.path, 'read')

    def test_excel_lock_and_concurrent_lock(self):
        for name in ['~$questions.xlsx', 'questions.xlsx.x-engine.lock']:
            lock = self.path.with_name(name)
            lock.touch()
            with self.assertRaises(workbook.WorkbookError) as error:
                workbook.execute(self.path, 'used', 'Q-001')
            self.assertEqual(error.exception.status, 423)
            self.assertEqual(self.path.read_bytes(), self.original)
            lock.unlink()

    def test_failed_replace_keeps_original_and_cleans_up(self):
        with patch.object(workbook.os, 'replace', side_effect=PermissionError):
            with self.assertRaises(PermissionError):
                workbook.execute(self.path, 'used', 'Q-001')
        self.assertEqual(self.path.read_bytes(), self.original)
        self.assertFalse(list(self.path.parent.glob('*.lock')))
        self.assertFalse(list(self.path.parent.glob('.x-engine-*')))

    def test_read_failure(self):
        with self.assertRaises(FileNotFoundError):
            workbook.execute(self.path.with_name('missing.xlsx'), 'read')

    def test_idempotent_used_keeps_date(self):
        result = workbook.execute(self.path, 'used', 'Q-002')
        self.assertEqual(result['questions'][1]['usedOn'], '2026-01-02')
        self.assertEqual(self.path.read_bytes(), self.original)


if __name__ == '__main__':
    unittest.main()
