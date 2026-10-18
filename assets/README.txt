Arquivos usados pelo index.html:

- foto.jpg     -> OK. Foto da seção Sobre (900x1200, 3:4, sem EXIF).
- avatar.jpg   -> OK. Avatar da navbar (160x160, recortado da foto do Talent Summit, sem EXIF).
- favicon.svg  -> OK. Ícone da aba: 3 curvas de nível verdes (#B5C77A) sobre o fundo #141A16.
- cv.pdf       -> FALTA. Currículo do botão "Baixar currículo" da seção Contato.
                  Use a versão SEM telefone e SEM endereço (este arquivo vai para o GitHub).

A versão completa do CV (com telefone, endereço etc.) pode ficar nesta pasta
com o nome cv-completo.pdf (ou cv-completo-qualquercoisa.pdf): o .gitignore
ignora assets/cv-completo*, então ela nunca é enviada para o GitHub.

Antes de publicar uma imagem nova, remova os metadados EXIF (podem conter
localização GPS).
