# Changelog

## Page lock 1.0.8

- New version number, so it is told apart from any copy of 1.0.7.
- Typing words beside a line break that stands alone inside an SVG is no longer refused; deleting the break, adding one or swapping it for a rule still is.
- MathML text (`<![CDATA[ a > b <svg> ]]>` inside `<math>`) can no longer hide a large inline SVG after it, so words beside the SVG stay editable. Text inside MathML's own text elements is read as HTML, as a browser does.
- A textarea, title, xmp, iframe, noembed or noframes written with a slash (`<textarea/>`) still holds text until its closing tag, as in a browser, so an SVG tag written inside it cannot hide a real SVG.
- A horizontal rule written with the editor's own marker (`<hr class="bwplbr">`) can no longer stand in for a line break standing alone; the marker is now one no page can write.
- A very large inline SVG is read as it comes, not tag by tag in memory, so a words-only save no longer runs a small host out of memory.
- The final layout check skips what is written inside a textarea (and script, style and the like), so an edited code example there cannot upset it.
- Inside an SVG's foreignObject, desc and title, and MathML's text elements, markup follows HTML rules, so an SVG written as text in an iframe or textarea there is not read as a nested SVG.
- The marker left where an SVG stood can no longer be forged by a `bwplsvg` element in the page.
- A quote added in a code example inside a textarea no longer upsets the layout check (the cleanup step skips textarea text too).
- Text in an SVG's desc or title (including a `>` or a literal `</svg>` in its CDATA) is read as text again; only what is written inside an HTML tag there follows HTML rules.
- A deeply nested SVG is read in one pass (the open elements are no longer walked again for each tag), and a very large one is held as one piece of text, so saves stay fast and small.
- Names that look like the page lock's own markers (`bwplsvg-card`, `bwplsvx-card`) stay different from each other.
- An unfinished tag typed in a textarea (such as `<br`) can no longer cut away its real closing tag: what is inside a textarea, script or style is taken out before the markup is cleaned up.
- In an SVG's desc or title, CDATA written after an HTML tag has closed is text again, as in a browser.
- Closing a tag in a deeply nested SVG no longer copies the list of open elements, so a 20,000-level SVG is read in about two seconds, not minutes.

## Page lock 1.0.7

- New version number, so it is told apart from any copy of 1.0.6.
- A stray `<?` ends at the first `>`, as in a browser, so a `?>` further on cannot swallow a large inline SVG; a textarea, script or style ends only at its own closing tag (`</textarea-example>` does not end one).
- A long run of line breaks inside an SVG is read once, not once per break, so a save stays fast.
- A line break standing alone between elements inside an SVG can no longer be deleted or swapped for a horizontal rule, and outside an SVG a standalone break swapped for a rule is refused too.

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
