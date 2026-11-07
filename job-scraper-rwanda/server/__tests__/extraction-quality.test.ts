import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applicationDestination, supportedDegree, normalizeLocation } from '../../supabase/functions/ai-job-extractor/quality.ts';

test('fraud contacts never become application destinations', () => {
  const text = 'Report suspicious communication to globalhotline@oneacrefund.org, but do not send applications to this email address.';
  assert.deepEqual(applicationDestination('globalhotline@oneacrefund.org', text, 'https://example.com/job'), { apply_method: 'external_link', apply_contact: 'https://example.com/job' });
  assert.equal(applicationDestination('help@example.com', 'Do not send applications to help@example.com.', 'https://example.com/job').apply_method, 'external_link');
});
test('explicit application emails are retained; invented emails are rejected', () => {
  assert.equal(applicationDestination('jobs@example.com', 'Submit your application and CV to jobs@example.com.', 'https://example.com/job').apply_method, 'email');
  assert.equal(applicationDestination('fake@example.com', 'Apply using the portal.', 'https://example.com/job').apply_method, 'external_link');
});
test('seniority does not manufacture a degree requirement', () => {
  assert.equal(supportedDegree('bachelor', 'At least five years of HR experience.'), null);
  assert.equal(supportedDegree('bachelor', 'A bachelor’s degree is required.'), 'bachelor');
  assert.equal(supportedDegree(null, 'At least five years of HR experience.'), null);
});
test('duplicate locations collapse without losing distinct components', () => {
  assert.equal(normalizeLocation('Ngoma | Ngoma'), 'Ngoma');
  assert.equal(normalizeLocation('Kigali | Rwanda'), 'Kigali | Rwanda');
});
