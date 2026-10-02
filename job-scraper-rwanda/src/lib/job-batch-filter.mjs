// Conservative pre-AI filter shared by every source in the prepared batch.
// A vacancy mentioning procurement duties is not itself a procurement notice.
export function nonJobReason(item) {
  if (item.content_type && item.content_type !== 'job') return `classified ${item.content_type}`;
  const title = (item.title || '').replace(/\s+/g, ' ').trim();
  const description = (item.description_text || item.description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  const tenderTitle = /\b(?:tenders?|rfp|rfq|eoi|request for (?:proposals?|quotations?|expressions? of interest)|invitation (?:to|for) (?:bid|bids|bidding|tender)|call for (?:proposals?|expressions? of interest)|procurement of|provision of|supply (?:of|and installation)|isoko|amasoko|gupiganira)\b/i;
  if (tenderTitle.test(title)) return 'tender/procurement title';
  if (/\bterms of reference\b|\bTOR\b/i.test(title)) return 'terms of reference requires review';
  if (/\b(?:invites?|inviting)\b.{0,100}\b(?:bids|quotations|proposals|eligible suppliers|eligible firms)\b/i.test(description)
      || /\b(?:bidders (?:must|shall|are required)|submit (?:their |your )?sealed bids|proposal submission deadline)\b/i.test(description)) {
    return 'tender/procurement instructions';
  }
  return null;
}
