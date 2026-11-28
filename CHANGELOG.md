# Changelog

## Page lock 1.0.6

- New version number, so it is told apart from any copy of 1.0.5.
- A stray `<?`, or one written in a textarea, script or style, can no longer hide a large inline SVG after it, so words beside the SVG stay editable.
- A line break standing alone between elements inside an SVG (such as in a foreignObject) is a layout change on a locked page, as it is outside an SVG.

## Page lock 1.0.5

- New version number, so it is told apart from any copy of 1.0.4.
- Large inline SVGs are now set aside before anything else reads the markup, and inside one comments, CDATA and processing instructions are passed over whole. What an SVG's description says (even `<svg>` or an unfinished `<svg title="`) is no longer mistaken for markup or damaged, so editing it, or the words beside it, is not refused.

## Page lock 1.0.4

- New version number, so it is told apart from any earlier 1.0.3 copy (a site runs the copy with the highest number).
- Literal `<svg>` text inside an SVG's CDATA is no longer taken for a nested SVG, so words beside that graphic stay editable.
- Pages with many inline SVGs are read much faster on save (the tag list is no longer copied for each SVG).

## Page lock 1.0.3

- New version number, so a site can tell this copy from 1.0.2 (the first with the fixes below).
- Words beside a large inline SVG can be edited on a locked page again: when WordPress cannot tidy the markup, its tags are read as they stand instead of the whole piece having to stay the same.
- Large inline SVGs are set aside before WordPress tidies the words round them, so paragraphs beside one are read as anywhere else (editor-added paragraph tags are no change; a paragraph added or removed is), and a text edit that tips an SVG over WordPress's limit is not refused.
- Autosaves keep their section ids (the live page and ordinary revisions still do not), so restoring one that only changed words is no longer mistaken for a move.
- Each inline SVG is matched to its own closing tag: a self-closing one before another no longer joins them with the words between, and a nested one ends at its own closing tag.
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
