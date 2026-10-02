import assert from 'node:assert/strict';
import { nonJobReason } from './src/lib/job-batch-filter.mjs';
for (const title of ['Tender for office supplies', 'Request for Proposal for hotel services', 'RFQ: equipment', 'Itangazo ry’isoko ryo kugura ibikoresho', 'Terms of Reference for consulting services']) {
  assert(nonJobReason({ title, content_type: 'job' }), title);
}
assert(nonJobReason({ title: 'Services notice', description: 'Eligible bidders must submit sealed bids.' }));
assert(nonJobReason({ title: 'Consultancy', content_type: 'tender' }));
for (const title of ['Bartender', 'Procurement Officer', 'Supply Chain Manager']) {
  assert.equal(nonJobReason({ title, description: 'Manage procurement duties. Apply with your CV.' }), null, title);
}
assert.equal(nonJobReason({title: 'Quantity Surveyor', description: 'Prepare tender documents and assess bid security as part of your duties.'}), null);
console.log('11 job batch filter tests passed');
