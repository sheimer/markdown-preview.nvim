# Markdown preview links

Open this document with `:MarkdownPreview`, then try the links below with a
normal click, Cmd/Ctrl-click, middle-click, or the browser's **Open Link in New
Tab/Window** menu. The editor should stay on this document.

- [Detail document](markdown-preview-links/detail%20with%20spaces.md)
- [A heading in that document](markdown-preview-links/detail%20with%20spaces.md#linked-heading)
- [Reference-style detail][detail]
- [Wide tables](markdown-preview-tables.md)
- [This document's local heading](#local-heading)
- [External web link](https://github.com/iamcco/markdown-preview.nvim)
- [Missing document](markdown-preview-links/does-not-exist.md)

[detail]: markdown-preview-links/detail%20with%20spaces.md

## Local heading

This anchor stays in the current preview. The missing-document link should
show an explanatory message in the newly opened tab.

To check live updates, open the detail buffer in Neovim with `:b detail`, edit
it without saving, and follow the detail link again. Both previews of that
buffer should show the unsaved content. Deleting the detail buffer should
close its previews and leave this document's preview open.
