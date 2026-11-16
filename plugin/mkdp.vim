" Neovim is the supported editor for this independently maintained fork.
if !has('nvim-0.12.2')
  echoerr 'markdown-preview.nvim requires Neovim 0.12.2 or newer'
  finish
endif
if exists('g:loaded_markdown_preview')
  finish
endif
let g:loaded_markdown_preview = 1

" set to 1, the vim will open the preview window once enter the markdown
" buffer
if !exists('g:mkdp_auto_start')
  let g:mkdp_auto_start = 0
endif

" let g:mkdp_auto_open = 0
" set to 1, the vim will auto open preview window when you edit the
" markdown file

" Buffer switches leave independent previews open; retained for old configs.
if !exists('g:mkdp_auto_close')
  let g:mkdp_auto_close = 0
endif

" set to 1, the vim will just refresh markdown when save the buffer or
" leave from insert mode, default 0 is auto refresh markdown as you edit or
" move the cursor
if !exists('g:mkdp_refresh_slow')
  let g:mkdp_refresh_slow = 0
endif

" set to 1, the MarkdownPreview command can be use for all files,
" by default it just can be use in markdown file
if !exists('g:mkdp_command_for_global')
  let g:mkdp_command_for_global = 0
endif

" set to 1, preview server available to others in your network
" by default, the server only listens on localhost (127.0.0.1)
if !exists('g:mkdp_open_to_the_world')
  let g:mkdp_open_to_the_world = 0
endif

" use custom ip to open preview page
" default empty
if !exists('g:mkdp_open_ip')
  let g:mkdp_open_ip = ''
endif

" set to 1, echo preview page url in command line when open preview page
" default is 0
if !exists('g:mkdp_echo_preview_url')
  let g:mkdp_echo_preview_url = 0
endif

" use custom vim function to open preview page
" this function will receive url as param
if !exists('g:mkdp_browserfunc')
  let g:mkdp_browserfunc = ''
endif

" specify browser to open preview page
if !exists('g:mkdp_browser')
  let g:mkdp_browser = ''
endif

if !exists('g:mkdp_preview_options')
  let g:mkdp_preview_options = {
      \ 'mkit': {},
      \ 'katex': {},
      \ 'uml': {},
      \ 'maid': {},
      \ 'disable_sync_scroll': 0,
      \ 'sync_scroll_type': 'middle',
      \ 'hide_yaml_meta': 1,
      \ 'sequence_diagrams': {},
      \ 'flowchart_diagrams': {},
      \ 'content_editable': v:false,
      \ 'disable_filename': 0,
      \ 'toc': {}
      \ }
elseif !has_key(g:mkdp_preview_options, 'disable_filename')
  let g:mkdp_preview_options['disable_filename'] = 0
endif

" markdown css file absolute path
if !exists('g:mkdp_markdown_css')
  let g:mkdp_markdown_css = ''
endif

" highlight css file absolute path
if !exists('g:mkdp_highlight_css')
  let g:mkdp_highlight_css = ''
endif

if !exists('g:mkdp_port')
  let g:mkdp_port = ''
endif

if !exists('g:mkdp_theme')
  let g:mkdp_theme = &background
endif

" preview page title
" ${name} will be replace with the file name
if !exists('g:mkdp_page_title')
  let g:mkdp_page_title = '「${name}」'
endif

" recognized filetypes
if !exists('g:mkdp_filetypes')
  let g:mkdp_filetypes = ['markdown']
endif

" markdown images custom path
if !exists('g:mkdp_images_path')
  let g:mkdp_images_path = ''
endif

" Retained for configuration compatibility; this fork uses independent previews.
if !exists('g:mkdp_combine_preview')
  let g:mkdp_combine_preview = 0
endif

" auto refetch combine preview contents when change markdown buffer
" only when g:mkdp_combine_preview is 1
if !exists('g:mkdp_combine_preview_auto_refresh')
  let g:mkdp_combine_preview_auto_refresh = 1
endif

" if there are any active preview client
let g:mkdp_clients_active = 0

" Commands and lifecycle live in Lua; the plugin works without a setup call.
command! MarkdownPreview lua require('markdown_preview').open()
command! MarkdownPreviewStop lua require('markdown_preview').close()
command! MarkdownPreviewToggle lua require('markdown_preview').toggle()
nnoremap <silent> <Plug>MarkdownPreview :MarkdownPreview<CR>
inoremap <silent> <Plug>MarkdownPreview <Esc>:MarkdownPreview<CR>a
nnoremap <silent> <Plug>MarkdownPreviewStop :MarkdownPreviewStop<CR>
inoremap <silent> <Plug>MarkdownPreviewStop <Esc>:MarkdownPreviewStop<CR>a
nnoremap <silent> <Plug>MarkdownPreviewToggle :MarkdownPreviewToggle<CR>
inoremap <silent> <Plug>MarkdownPreviewToggle <Esc>:MarkdownPreviewToggle<CR>a
lua require('markdown_preview').setup()
