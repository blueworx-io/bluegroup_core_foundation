# Changelog

## Page lock 1.0.2

- A locked-page save that is not a REST save and gets its content put back now sends the person to a page that says so, instead of "Page updated".
- Restoring a revision: edit permission is checked before the revision is read, and an autosave can no longer be restored to move sections.
- Markup outside sections is compared by tags, not by text inside quoted attributes.
- A closing marker that closes itself (`<!-- /wp:x /-->`) is read as a section, as WordPress reads it.
- A section with empty settings (`{}`) now gets an id like the others.
- Already in 1.0.1: refusing added markup on locked pages, and keeping same-type sections in their saved places.
