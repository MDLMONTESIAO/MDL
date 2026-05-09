# Passo a passo para publicar no GitHub

Use os comandos separados abaixo para nao misturar atualizacao de cifras com atualizacao do sistema.

## 1. Enviar somente as cifras

Quando voce alterar o conteudo do acervo, rode:

```bat
git status
git add acervo data
git commit -m "Atualiza acervo de cifras"
git push origin main
```

## 2. Atualizar o sistema

Quando voce alterar o sistema, rode:

```bat
git status
git add .gitignore README.md atualizar-acervo.bat iniciar.bat package.json package-lock.json render.yaml server.js docs modos-visualizacao-musicas public scripts
git commit -m "Atualiza sistema"
git push origin main
```

## Observacoes

- Se o `git commit` disser que nao ha nada para commit, significa que nao houve mudancas naquela parte.
- O comando de cifras publica somente `acervo` e `data`.
- O comando do sistema publica a aplicacao, scripts, documentacao e interface.
