# Changelog

## Page lock 1.0.3

- New version number, so a site can tell this copy from 1.0.2 (the first with the fixes below).
- Words beside a large inline SVG can be edited on a locked page again: when WordPress cannot tidy the markup, its tags are read as they stand instead of the whole piece having to stay the same.

- Paragraphs the editor puts round loose words beside such an SVG are no longer read as a change.
- Autosaves keep their section ids (the live page and ordinary revisions still do not), so restoring one that only changed words is no longer mistaken for a move.
- A `<br` written inside a quoted attribute is no longer read as a line break, so it cannot hide a closing tag.

## Page lock 1.0.2

- A locked-page save that is not a REST save and gets its content put back now sends the person to a page that says so, instead of "Page updated".
- Restoring a revision: edit permission is checked before the revision is read, and an autosave can no longer be restored to move sections.
- Markup outside sections is compared by tags, not by text inside quoted attributes.
- A closing marker that closes itself (`<!-- /wp:x /-->`) is read as a section, as WordPress reads it.
- A section with empty settings (`{}`) now gets an id like the others.
- Long attributes can no longer hide the layout check: markup that cannot be read is refused unless it is unchanged.
- Markup WordPress cannot tidy (such as a large inline SVG) no longer reads as empty, and a failed second reading of the old markup no longer blocks text edits when the layout already matches.
- The "page is locked" warning comes off the address after it is shown, so refreshing does not show it again.
- Already in 1.0.1: refusing added markup on locked pages, and keeping same-type sections in their saved places.
