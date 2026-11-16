" Compatibility entry point; the supported check is :checkhealth markdown_preview.
function! health#mkdp#check() abort
  lua require('markdown_preview.health').check()
endfunction
