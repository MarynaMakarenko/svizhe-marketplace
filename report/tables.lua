-- Додає невеликий відступ після кожної таблиці, щоб наступний абзац не прилипав до рамки.
function Table(t)
  local gap = '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="160" w:lineRule="exact"/></w:pPr></w:p>'
  return { t, pandoc.RawBlock('openxml', gap) }
end
